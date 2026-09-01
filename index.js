require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const { graphqlHTTP } = require("express-graphql");
const schema = require("./schema");
const root = require("./resolvers");
const pool = require("./db");
const { redisClient, connectRedis } = require("./cache");
const {
  parsePagination,
  parseSort,
  deprecationWarning,
} = require("./middlewares/query-parser");
const { authenticateToken, authorizeRole } = require("./middlewares/auth");
const {
  hashPassword,
  verifyPassword,
  generateToken,
} = require("./auth-helpers");

const app = express();
const PORT = process.env.PORT || 3000;

// ลำดับ middleware มีความสำคัญ: security header → CORS → logger → body parser
app.use(helmet());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  }),
);
app.use(morgan("dev"));
app.use(express.json({ limit: "10kb" }));

app.use(
  "/graphql",
  graphqlHTTP({
    schema: schema,
    rootValue: root,
    graphiql: true, // เปิดใช้งานหน้าทดสอบ GraphiQL ผ่านเบราว์เซอร์
  }),
);

// url endpoint สำหรับตรวจสอบสถานะ API
app.get("/", (req, res) => {
  res.status(200).json({ message: "Student API พร้อมใช้งาน" });
});

// =====================================================================
// API v1 Router
// =====================================================================
const v1Router = express.Router();

// [แบบฝึกหัดต่อยอดข้อ 3] แนบ Header Deprecation และ Link ไปยัง v2 อัตโนมัติทุก route ใน v1
v1Router.use(deprecationWarning);

// 1. GET: ดึงรายการนักศึกษาทั้งหมด พร้อม Dynamic Cache Key, Pagination, Filtering, Sorting
v1Router.get(
  "/students",
  parsePagination,
  parseSort,
  async (req, res, next) => {
    const { major } = req.query;
    const { page, limit, offset } = req.pagination;
    const { field, order } = req.sort;

    // [แบบฝึกหัดต่อยอดข้อ 2] ออกแบบ Cache Key ที่รวมพารามิเตอร์การค้นหาทั้งหมด
    const cacheKey = `students:page=${page}:limit=${limit}:major=${major || "all"}:sort=${field}:order=${order}`;

    try {
      // ตรวจสอบข้อมูลใน Cache ก่อน
      const cachedData = await redisClient.get(cacheKey);
      if (cachedData) {
        return res.status(200).json({
          message: "สำเร็จ (จาก cache)",
          ...JSON.parse(cachedData),
        });
      }

      let baseQuery = "SELECT * FROM students";
      let countQuery = "SELECT COUNT(*) AS total FROM students";
      const params = [];

      if (major) {
        baseQuery += " WHERE major = ?";
        countQuery += " WHERE major = ?";
        params.push(major);
      }

      // แทรก field/order ลง SQL ได้โดยตรงเฉพาะเพราะผ่าน allowlist ใน parseSort มาแล้ว
      baseQuery += ` ORDER BY ${field} ${order} LIMIT ? OFFSET ?`;

      const [rows] = await pool.query(baseQuery, [...params, limit, offset]);
      const [[{ total }]] = await pool.query(countQuery, params);

      const responsePayload = {
        data: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };

      // บันทึกผลลัพธ์ลง Cache (TTL 60 วินาที)
      await redisClient.setEx(cacheKey, 60, JSON.stringify(responsePayload));

      res.status(200).json({
        message: "สำเร็จ (จากฐานข้อมูล)",
        ...responsePayload,
      });
    } catch (err) {
      next(err);
    }
  },
);

// 2. GET: ดึงข้อมูลนักศึกษารายบุคคลตาม id
v1Router.get("/students/:id", async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM students WHERE id = ?", [
      req.params.id,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "ไม่พบข้อมูลนักศึกษา" },
      });
    }

    const student = rows[0];
    const shouldIncludeCourses = req.query.include === "courses";

    if (shouldIncludeCourses) {
      const [studentCourses] = await pool.query(
        `SELECT courses.* FROM courses
         JOIN enrollments ON courses.id = enrollments.course_id
         WHERE enrollments.student_id = ?`,
        [req.params.id],
      );
      return res.status(200).json({
        message: "สำเร็จ",
        data: { ...student, courses: studentCourses },
      });
    }

    res.status(200).json({ message: "สำเร็จ", data: student });
  } catch (err) {
    next(err);
  }
});

// 3. POST: เพิ่มข้อมูลนักศึกษาใหม่ พร้อมล้าง Cache แบบกวาดล้างทุกเงื่อนไข (students:*)
v1Router.post("/students", async (req, res, next) => {
  const { name, major, email } = req.body;

  if (!name || !major || !email) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "กรุณาระบุ name, major และ email ให้ครบถ้วน",
      },
    });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO students (name, major, email) VALUES (?, ?, ?)",
      [name, major, email],
    );

    // [แบบฝึกหัดต่อยอดข้อ 2] ค้นหาและลบ Cache ทุกตัวที่ขึ้นต้นด้วย students:*
    const keys = await redisClient.keys("students:*");
    if (keys.length > 0) {
      await redisClient.del(keys);
    }

    res.status(201).json({
      message: "เพิ่มข้อมูลสำเร็จ",
      data: { id: result.insertId, name, major, email },
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: { code: "DUPLICATE_EMAIL", message: "อีเมลนี้มีอยู่ในระบบแล้ว" },
      });
    }
    next(err);
  }
});

// 4. PUT: แก้ไขข้อมูลนักศึกษาทั้งระเบียน
v1Router.put("/students/:id", async (req, res, next) => {
  const { name, major } = req.body;

  if (!name || !major) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "กรุณาระบุ name และ major ให้ครบถ้วน",
      },
    });
  }

  try {
    const [result] = await pool.query(
      "UPDATE students SET name = ?, major = ? WHERE id = ?",
      [name, major, req.params.id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "ไม่พบข้อมูลนักศึกษา" },
      });
    }

    const [rows] = await pool.query("SELECT * FROM students WHERE id = ?", [
      req.params.id,
    ]);

    res.status(200).json({ message: "แก้ไขข้อมูลสำเร็จ", data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// Patch: อัปเดตเฉพาะฟิลด์ที่ส่งมา
v1Router.patch("/students/:id", async (req, res, next) => {
  const { name, major, email } = req.body;

  if (name === undefined && major === undefined && email === undefined) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "กรุณาระบุอย่างน้อยหนึ่งฟิลด์ที่ต้องการแก้ไข",
      },
    });
  }

  try {
    const [existingRows] = await pool.query(
      "SELECT * FROM students WHERE id = ?",
      [req.params.id],
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "ไม่พบข้อมูลนักศึกษา" },
      });
    }

    const current = existingRows[0];
    const updated = {
      name: name !== undefined ? name : current.name,
      major: major !== undefined ? major : current.major,
      email: email !== undefined ? email : current.email,
    };

    await pool.query(
      "UPDATE students SET name = ?, major = ?, email = ? WHERE id = ?",
      [updated.name, updated.major, updated.email, req.params.id],
    );

    const [rows] = await pool.query("SELECT * FROM students WHERE id = ?", [
      req.params.id,
    ]);

    res.status(200).json({ message: "แก้ไขข้อมูลสำเร็จ", data: rows[0] });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: { code: "DUPLICATE_EMAIL", message: "อีเมลนี้มีอยู่ในระบบแล้ว" },
      });
    }
    next(err);
  }
});

// 5. DELETE: ลบข้อมูลนักศึกษา (เฉพาะ admin)
v1Router.delete(
  "/students/:id",
  authenticateToken,
  authorizeRole("admin"),
  async (req, res, next) => {
    try {
      const [result] = await pool.query("DELETE FROM students WHERE id = ?", [
        req.params.id,
      ]);
      if (result.affectedRows === 0) {
        return res.status(404).json({
          error: { code: "NOT_FOUND", message: "ไม่พบข้อมูลนิสิต" },
        });
      }
      res.status(200).json({ message: "ลบข้อมูลสำเร็จ" });
    } catch (err) {
      next(err);
    }
  },
);

// ข้อมูลผู้ใช้งานที่ล็อกอิน
v1Router.get("/auth/me", authenticateToken, (req, res) => {
  res.status(200).json({ message: "สำเร็จ", data: req.user });
});

// ลงทะเบียนเรียนด้วย Transaction
v1Router.post("/students/:id/enrollments", async (req, res, next) => {
  const studentId = req.params.id;
  const { courseId } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [courseRows] = await connection.query(
      "SELECT * FROM courses WHERE id = ? FOR UPDATE",
      [courseId],
    );

    if (courseRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        error: { code: "COURSE_NOT_FOUND", message: "ไม่พบรายวิชาที่ระบุ" },
      });
    }

    if (courseRows[0].seat_available <= 0) {
      await connection.rollback();
      return res.status(409).json({
        error: { code: "SEAT_FULL", message: "ที่นั่งเต็มแล้ว" },
      });
    }

    await connection.query(
      "INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)",
      [studentId, courseId],
    );

    await connection.query(
      "UPDATE courses SET seat_available = seat_available - 1 WHERE id = ?",
      [courseId],
    );

    await connection.commit();
    res.status(201).json({ message: "ลงทะเบียนสำเร็จ" });
  } catch (err) {
    await connection.rollback();
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: {
          code: "ALREADY_ENROLLED",
          message: "นักศึกษาลงทะเบียนรายวิชานี้ไปแล้ว",
        },
      });
    }
    next(err);
  } finally {
    connection.release();
  }
});

// Auth: Register / Login
v1Router.post("/auth/register", async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "กรุณาระบุ email และ password",
      },
    });
  }

  try {
    const passwordHash = await hashPassword(password);
    const [result] = await pool.query(
      "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'student')",
      [email, passwordHash],
    );

    res.status(201).json({
      message: "สมัครสมาชิกสำเร็จ",
      data: { id: result.insertId, email, role: "student" },
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: { code: "DUPLICATE_EMAIL", message: "อีเมลนี้มีอยู่ในระบบแล้ว" },
      });
    }
    next(err);
  }
});

v1Router.post("/auth/login", async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "กรุณาระบุ email และ password",
      },
    });
  }

  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);

    if (rows.length === 0) {
      return res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
        },
      });
    }

    const user = rows[0];
    const isPasswordValid = await verifyPassword(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
        },
      });
    }

    const token = generateToken(user);
    res.status(200).json({ message: "เข้าสู่ระบบสำเร็จ", token });
  } catch (err) {
    next(err);
  }
});

// ดึงรายวิชาที่นักศึกษาลงทะเบียน
v1Router.get("/students/:id/courses", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT courses.* FROM courses
       JOIN enrollments ON courses.id = enrollments.course_id
       WHERE enrollments.student_id = ?`,
      [req.params.id],
    );
    res.status(200).json({ message: "สำเร็จ", data: rows });
  } catch (err) {
    next(err);
  }
});

// [แบบฝึกหัดต่อยอดข้อ 1] GET /courses พร้อม Caching (TTL 300 วินาที)
v1Router.get("/courses", async (req, res, next) => {
  const cacheKey = "courses:all";
  try {
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      return res.status(200).json({
        message: "สำเร็จ (จาก cache)",
        data: JSON.parse(cachedData),
      });
    }

    const [rows] = await pool.query("SELECT * FROM courses");
    await redisClient.setEx(cacheKey, 300, JSON.stringify(rows));

    res.status(200).json({
      message: "สำเร็จ (จากฐานข้อมูล)",
      data: rows,
    });
  } catch (err) {
    next(err);
  }
});

app.use("/api/v1", v1Router);

// =====================================================================
// API v2 Router
// =====================================================================
const v2Router = express.Router();

v2Router.get("/students", async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM students");
    res.status(200).json({ items: rows, count: rows.length });
  } catch (err) {
    next(err);
  }
});

app.use("/api/v2", v2Router);

// =====================================================================
// Error Handling & 404
// =====================================================================
app.use((req, res) => {
  res.status(404).json({
    error: { code: "ROUTE_NOT_FOUND", message: "ไม่พบเส้นทางที่ร้องขอ" },
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    error: {
      code: statusCode === 500 ? "INTERNAL_SERVER_ERROR" : err.type || "ERROR",
      message:
        statusCode === 500
          ? "เกิดข้อผิดพลาดที่ไม่คาดคิดภายในระบบ"
          : err.message,
    },
  });
});

connectRedis()
  .then(() => {
    app.listen(PORT, () => {
      console.log(
        `Server กำลังทำงานที่ http://localhost:${PORT} (${process.env.NODE_ENV})`,
      );
    });
  })
  .catch((err) => {
    console.error("เชื่อมต่อ Redis ไม่สำเร็จ เซิร์ฟเวอร์จะไม่เริ่มทำงาน:", err);
    process.exit(1);
  });

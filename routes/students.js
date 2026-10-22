const express = require("express");
const router = express.Router();
const pool = require("../db");
const { sendError } = require("../lib/http");
const { createStudentLimiter } = require("../lib/middleware");
const { authenticateToken, authorizeRole } = require("../middlewares/auth");
const { parsePagination, parseSort } = require("../middlewares/query-parser");
const { redisClient } = require("../cache");

// สัปดาห์ที่ 7: ล้างแคชรายการนิสิตทุก key เมื่อข้อมูลเปลี่ยน (แบบฝึกหัดข้อ 2: key รวมพารามิเตอร์)
async function invalidateStudentListCache() {
  const keys = await redisClient.keys("students:list:*");
  if (keys.length > 0) await redisClient.del(keys);
}

// 1. GET: ดึงรายการนิสิต — pagination + filtering + sorting + cache (สัปดาห์ที่ 7)
router.get("/", parsePagination, parseSort, async (req, res, next) => {
  const { major } = req.query;
  const { page, limit, offset } = req.pagination;
  const { field, order } = req.sort;

  // แบบฝึกหัดข้อ 2: cache key รวมทุกพารามิเตอร์ เพื่อไม่ให้เงื่อนไขต่างกันปนแคชกัน
  const cacheKey = `students:list:page=${page}:limit=${limit}:major=${major || ""}:sort=${field}:order=${order}`;

  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      const payload = JSON.parse(cached);
      return res.status(200).json({ message: "สำเร็จ (จาก cache)", ...payload });
    }

    let baseQuery = "SELECT * FROM students";
    let countQuery = "SELECT COUNT(*) AS total FROM students";
    const params = [];
    if (major) {
      baseQuery += " WHERE major = ?";
      countQuery += " WHERE major = ?";
      params.push(major);
    }
    // field/order แทรกตรงได้เพราะผ่าน allowlist ใน parseSort แล้วเท่านั้น
    baseQuery += ` ORDER BY ${field} ${order} LIMIT ? OFFSET ?`;

    const [rows] = await pool.query(baseQuery, [...params, limit, offset]);
    const [[{ total }]] = await pool.query(countQuery, params);

    const payload = {
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
    await redisClient.set(cacheKey, JSON.stringify(payload), { EX: 60 });

    res.status(200).json({ message: "สำเร็จ (จากฐานข้อมูล)", ...payload });
  } catch (err) {
    next(err);
  }
});

// 2. GET: ดึงข้อมูลนิสิตรายบุคคล (รองรับ ?include=courses ด้วย JOIN)
router.get("/:id", async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM students WHERE id = ?", [
      req.params.id,
    ]);

    if (rows.length === 0) {
      return sendError(res, 404, "NOT_FOUND", "ไม่พบข้อมูลนิสิต");
    }

    const student = rows[0];

    if (req.query.include === "courses") {
      const [courses] = await pool.query(
        `SELECT courses.* FROM courses
         JOIN enrollments ON courses.id = enrollments.course_id
         WHERE enrollments.student_id = ?`,
        [req.params.id],
      );
      return res
        .status(200)
        .json({ message: "สำเร็จ", data: { ...student, courses } });
    }

    res.status(200).json({ message: "สำเร็จ", data: student });
  } catch (err) {
    next(err);
  }
});

// แบบฝึกหัดต่อยอดสัปดาห์ที่ 5 ข้อ 1: รายวิชาของนิสิตด้วย JOIN เดียว
router.get("/:id/courses", async (req, res, next) => {
  try {
    const [students] = await pool.query("SELECT id FROM students WHERE id = ?", [
      req.params.id,
    ]);
    if (students.length === 0) {
      return sendError(res, 404, "NOT_FOUND", "ไม่พบข้อมูลนิสิต");
    }

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

function validateStudentBody(body) {
  const { name, major, email } = body;
  if (!name || !major || !email) {
    return "กรุณาระบุ name, major และ email ให้ครบถ้วน";
  }
  if (typeof name !== "string" || name.trim().length < 2) {
    return "name ต้องเป็นข้อความที่มีความยาวอย่างน้อย 2 ตัวอักษร";
  }
  if (name.length > 100) {
    return "name ต้องมีความยาวไม่เกิน 100 ตัวอักษร";
  }
  return null;
}

// 3. POST: เพิ่มข้อมูลนิสิตใหม่ (rate limit จากสัปดาห์ที่ 4)
router.post("/", createStudentLimiter, async (req, res, next) => {
  const errMsg = validateStudentBody(req.body);
  if (errMsg) {
    return sendError(res, 400, "VALIDATION_ERROR", errMsg);
  }

  const { name, major, email } = req.body;
  try {
    const [result] = await pool.query(
      "INSERT INTO students (name, major, email) VALUES (?, ?, ?)",
      [name, major, email],
    );
    await invalidateStudentListCache();
    res.status(201).json({
      message: "เพิ่มข้อมูลสำเร็จ",
      data: { id: result.insertId, name, major, email },
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return sendError(res, 409, "DUPLICATE_EMAIL", "อีเมลนี้มีอยู่ในระบบแล้ว");
    }
    next(err);
  }
});

// 4. PUT: แก้ไขข้อมูลนิสิตทั้งระเบียน
// สัปดาห์ที่ 6 แบบฝึกหัดข้อ 2: ต้องล็อกอิน และแก้ได้เฉพาะระเบียนที่ user_id ตรงกับตนเอง (admin แก้ได้ทุกระเบียน)
router.put("/:id", authenticateToken, async (req, res, next) => {
  const errMsg = validateStudentBody(req.body);
  if (errMsg) {
    return sendError(res, 400, "VALIDATION_ERROR", errMsg);
  }

  const { name, major, email } = req.body;
  try {
    const [existing] = await pool.query(
      "SELECT user_id FROM students WHERE id = ?",
      [req.params.id],
    );
    if (existing.length === 0) {
      return sendError(res, 404, "NOT_FOUND", "ไม่พบข้อมูลนิสิต");
    }

    const isOwner = existing[0].user_id === req.user.id;
    if (!isOwner && req.user.role !== "admin") {
      return sendError(res, 403, "FORBIDDEN", "แก้ไขได้เฉพาะข้อมูลของตนเอง");
    }

    const [result] = await pool.query(
      "UPDATE students SET name = ?, major = ?, email = ? WHERE id = ?",
      [name, major, email, req.params.id],
    );
    if (result.affectedRows === 0) {
      return sendError(res, 404, "NOT_FOUND", "ไม่พบข้อมูลนิสิต");
    }
    await invalidateStudentListCache();
    res
      .status(200)
      .json({ message: "แก้ไขข้อมูลสำเร็จ", data: { id: Number(req.params.id), name, major, email } });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return sendError(res, 409, "DUPLICATE_EMAIL", "อีเมลนี้มีอยู่ในระบบแล้ว");
    }
    next(err);
  }
});

// 5. PATCH: แก้ไขบางฟิลด์
router.patch("/:id", async (req, res, next) => {
  const allowed = ["name", "major", "email"];
  const fields = allowed.filter((f) => req.body[f] !== undefined);

  if (fields.length === 0) {
    return sendError(res, 400, "VALIDATION_ERROR", "ไม่มีฟิลด์ที่จะแก้ไข");
  }

  const setClause = fields.map((f) => `${f} = ?`).join(", ");
  const values = fields.map((f) => req.body[f]);

  try {
    const [result] = await pool.query(
      `UPDATE students SET ${setClause} WHERE id = ?`,
      [...values, req.params.id],
    );
    if (result.affectedRows === 0) {
      return sendError(res, 404, "NOT_FOUND", "ไม่พบข้อมูลนิสิต");
    }
    const [rows] = await pool.query("SELECT * FROM students WHERE id = ?", [
      req.params.id,
    ]);
    await invalidateStudentListCache();
    res.status(200).json({ message: "แก้ไขข้อมูลสำเร็จ", data: rows[0] });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return sendError(res, 409, "DUPLICATE_EMAIL", "อีเมลนี้มีอยู่ในระบบแล้ว");
    }
    next(err);
  }
});

// 6. DELETE: ลบข้อมูลนิสิต — สัปดาห์ที่ 6: ต้องล็อกอินและเป็น admin เท่านั้น
router.delete("/:id", authenticateToken, authorizeRole("admin"), async (req, res, next) => {
  try {
    const [result] = await pool.query("DELETE FROM students WHERE id = ?", [
      req.params.id,
    ]);
    if (result.affectedRows === 0) {
      return sendError(res, 404, "NOT_FOUND", "ไม่พบข้อมูลนิสิต");
    }
    await invalidateStudentListCache();
    res.status(200).json({ message: "ลบข้อมูลสำเร็จ" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

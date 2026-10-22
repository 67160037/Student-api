const express = require("express");
const pool = require("../db");
const { sendError } = require("../lib/http");

// สัปดาห์ที่ 5: enrollments ย้ายมาใช้ตาราง MySQL + Transaction

// เส้นทางแบบแบน: GET /api/v1/enrollments
const flat = express.Router();
flat.get("/", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT student_id, course_id FROM enrollments ORDER BY student_id, course_id",
    );
    res.status(200).json({ message: "สำเร็จ", data: rows });
  } catch (err) {
    next(err);
  }
});

// เส้นทางแบบซ้อนใต้ student: /api/v1/students/:id/enrollments
const nested = express.Router({ mergeParams: true });

// 3.3: ลงทะเบียนเรียนด้วย Transaction (ตรวจที่นั่งว่างก่อน แล้วลด seat_available)
nested.post("/", async (req, res, next) => {
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
      return sendError(res, 404, "COURSE_NOT_FOUND", "ไม่พบรายวิชาที่ระบุ");
    }

    if (courseRows[0].seat_available <= 0) {
      await connection.rollback();
      return sendError(res, 409, "SEAT_FULL", "ที่นั่งเต็มแล้ว");
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
      return sendError(
        res,
        409,
        "ALREADY_ENROLLED",
        "นิสิตลงทะเบียนรายวิชานี้ไปแล้ว",
      );
    }
    if (err.code === "ER_NO_REFERENCED_ROW_2") {
      return sendError(res, 404, "NOT_FOUND", "ไม่พบนิสิตหรือรายวิชาที่ระบุ");
    }
    next(err);
  } finally {
    connection.release();
  }
});

// แบบฝึกหัดต่อยอดข้อ 2: เวอร์ชันไม่ใช้ Transaction (ไว้เปรียบเทียบความเสี่ยง data inconsistency)
nested.post("/unsafe", async (req, res, next) => {
  const studentId = req.params.id;
  const { courseId } = req.body;
  try {
    const [courseRows] = await pool.query("SELECT * FROM courses WHERE id = ?", [
      courseId,
    ]);
    if (courseRows.length === 0) {
      return sendError(res, 404, "COURSE_NOT_FOUND", "ไม่พบรายวิชาที่ระบุ");
    }
    if (courseRows[0].seat_available <= 0) {
      return sendError(res, 409, "SEAT_FULL", "ที่นั่งเต็มแล้ว");
    }

    // ไม่มี transaction: หากเกิดข้อผิดพลาดระหว่าง INSERT กับ UPDATE
    // จะได้ enrollment ที่บันทึกแล้วแต่ seat_available ไม่ถูกลด (ข้อมูลไม่สอดคล้อง)
    await pool.query(
      "INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)",
      [studentId, courseId],
    );
    await pool.query(
      "UPDATE courses SET seat_available = seat_available - 1 WHERE id = ?",
      [courseId],
    );

    res.status(201).json({ message: "ลงทะเบียนสำเร็จ (unsafe)" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return sendError(
        res,
        409,
        "ALREADY_ENROLLED",
        "นิสิตลงทะเบียนรายวิชานี้ไปแล้ว",
      );
    }
    next(err);
  }
});

// แบบฝึกหัดต่อยอดข้อ 3: ยกเลิกการลงทะเบียนด้วย Transaction (ลบ enrollment + คืน seat 1 ที่นั่ง)
nested.delete("/:courseId", async (req, res, next) => {
  const studentId = req.params.id;
  const courseId = req.params.courseId;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      "DELETE FROM enrollments WHERE student_id = ? AND course_id = ?",
      [studentId, courseId],
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return sendError(res, 404, "NOT_FOUND", "ไม่พบการลงทะเบียนรายวิชานี้");
    }

    await connection.query(
      "UPDATE courses SET seat_available = seat_available + 1 WHERE id = ?",
      [courseId],
    );

    await connection.commit();
    res.status(200).json({ message: "ยกเลิกการลงทะเบียนสำเร็จ" });
  } catch (err) {
    await connection.rollback();
    next(err);
  } finally {
    connection.release();
  }
});

module.exports = { flat, nested };

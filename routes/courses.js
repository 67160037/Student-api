const express = require("express");
const router = express.Router();
const pool = require("../db");
const { sendError } = require("../lib/http");
const { redisClient } = require("../cache");

const COURSES_CACHE_KEY = "courses:all";
// รายวิชาเปลี่ยนไม่บ่อยเท่านิสิต จึงตั้ง TTL ยาวกว่า (5 นาที) — แบบฝึกหัดต่อยอดสัปดาห์ที่ 7 ข้อ 1
const COURSES_CACHE_TTL = 300;

async function invalidateCoursesCache() {
  await redisClient.del(COURSES_CACHE_KEY);
}

// สัปดาห์ที่ 5: courses ใช้ตาราง MySQL / สัปดาห์ที่ 7: เพิ่ม cache
router.get("/", async (req, res, next) => {
  try {
    const cached = await redisClient.get(COURSES_CACHE_KEY);
    if (cached) {
      return res
        .status(200)
        .json({ message: "สำเร็จ (จาก cache)", data: JSON.parse(cached) });
    }

    const [rows] = await pool.query("SELECT * FROM courses");
    await redisClient.set(COURSES_CACHE_KEY, JSON.stringify(rows), {
      EX: COURSES_CACHE_TTL,
    });
    res.status(200).json({ message: "สำเร็จ (จากฐานข้อมูล)", data: rows });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM courses WHERE id = ?", [
      req.params.id,
    ]);
    if (rows.length === 0) {
      return sendError(res, 404, "NOT_FOUND", "ไม่พบข้อมูลรายวิชา");
    }
    res.status(200).json({ message: "สำเร็จ", data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  const { course_name: courseName, credit } = req.body;
  const seatAvailable = req.body.seat_available;

  if (!courseName || credit === undefined) {
    return sendError(
      res,
      400,
      "VALIDATION_ERROR",
      "กรุณาระบุ course_name และ credit ให้ครบถ้วน",
    );
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO courses (course_name, credit, seat_available) VALUES (?, ?, ?)",
      [courseName, credit, seatAvailable ?? 30],
    );
    await invalidateCoursesCache();
    res.status(201).json({
      message: "เพิ่มข้อมูลสำเร็จ",
      data: {
        id: result.insertId,
        course_name: courseName,
        credit,
        seat_available: seatAvailable ?? 30,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.put("/:id", async (req, res, next) => {
  const { course_name: courseName, credit } = req.body;
  const seatAvailable = req.body.seat_available;

  if (!courseName || credit === undefined || seatAvailable === undefined) {
    return sendError(
      res,
      400,
      "VALIDATION_ERROR",
      "กรุณาระบุ course_name, credit และ seat_available ให้ครบถ้วน",
    );
  }

  try {
    const [result] = await pool.query(
      "UPDATE courses SET course_name = ?, credit = ?, seat_available = ? WHERE id = ?",
      [courseName, credit, seatAvailable, req.params.id],
    );
    if (result.affectedRows === 0) {
      return sendError(res, 404, "NOT_FOUND", "ไม่พบข้อมูลรายวิชา");
    }
    await invalidateCoursesCache();
    res.status(200).json({
      message: "แก้ไขข้อมูลสำเร็จ",
      data: {
        id: Number(req.params.id),
        course_name: courseName,
        credit,
        seat_available: seatAvailable,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const [result] = await pool.query("DELETE FROM courses WHERE id = ?", [
      req.params.id,
    ]);
    if (result.affectedRows === 0) {
      return sendError(res, 404, "NOT_FOUND", "ไม่พบข้อมูลรายวิชา");
    }
    await invalidateCoursesCache();
    res.status(200).json({ message: "ลบข้อมูลสำเร็จ" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

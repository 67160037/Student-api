const express = require("express");
const router = express.Router();
const pool = require("../db");
const { sendError } = require("../lib/http");
const { hashPassword, verifyPassword, generateToken } = require("../auth-helpers");
const { authenticateToken } = require("../middlewares/auth");

// สัปดาห์ที่ 6: register กำหนด role = 'student' เสมอ ไม่รับจาก client (กัน Mass Assignment)
router.post("/register", async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return sendError(res, 400, "VALIDATION_ERROR", "กรุณาระบุ email และ password");
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
      return sendError(res, 409, "DUPLICATE_EMAIL", "อีเมลนี้มีอยู่ในระบบแล้ว");
    }
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return sendError(res, 400, "VALIDATION_ERROR", "กรุณาระบุ email และ password");
  }

  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    const user = rows[0];

    // ตรวจ verifyPassword เสมอแม้ไม่พบ user เพื่อลด timing side-channel
    const isValid = user
      ? await verifyPassword(password, user.password_hash)
      : await verifyPassword(password, "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidin");

    if (!user || !isValid) {
      return sendError(res, 401, "INVALID_CREDENTIALS", "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    }

    const token = generateToken(user);
    res.status(200).json({ message: "เข้าสู่ระบบสำเร็จ", token });
  } catch (err) {
    next(err);
  }
});

// เฉพาะผู้ที่ล็อกอินแล้ว ดูข้อมูลของตนเอง
router.get("/me", authenticateToken, (req, res) => {
  res.status(200).json({ message: "สำเร็จ", data: req.user });
});

// แบบฝึกหัดต่อยอดข้อ 1: เปลี่ยนรหัสผ่าน
router.patch("/change-password", authenticateToken, async (req, res, next) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return sendError(
      res,
      400,
      "VALIDATION_ERROR",
      "กรุณาระบุ oldPassword และ newPassword",
    );
  }

  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [
      req.user.id,
    ]);
    if (rows.length === 0) {
      return sendError(res, 404, "NOT_FOUND", "ไม่พบบัญชีผู้ใช้");
    }

    const isValid = await verifyPassword(oldPassword, rows[0].password_hash);
    if (!isValid) {
      return sendError(res, 401, "INVALID_CREDENTIALS", "รหัสผ่านเดิมไม่ถูกต้อง");
    }

    const newHash = await hashPassword(newPassword);
    await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [
      newHash,
      req.user.id,
    ]);

    res.status(200).json({ message: "เปลี่ยนรหัสผ่านสำเร็จ" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

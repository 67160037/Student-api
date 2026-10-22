const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");

const isTest = process.env.NODE_ENV === "test";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 1000 : 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "พยายามเข้าสู่ระบบเกินจำนวนที่กำหนด กรุณาลองใหม่ภายหลัง",
    },
  },
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isTest ? 1000 : 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

// แบบฝึกหัดต่อยอดข้อ 2: โควตาต่อผู้ใช้ แยกตาม role (ใช้หลัง authenticateToken เสมอ)
const ROLE_LIMITS = { admin: 200, student: 30 };

const userLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: (req) => (isTest ? 1000 : ROLE_LIMITS[req.user?.role] ?? ROLE_LIMITS.student),
  keyGenerator: (req) =>
    req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "เรียกใช้งานเกินโควตาของบัญชีนี้ กรุณาลองใหม่ภายหลัง",
    },
  },
});

module.exports = { authLimiter, generalLimiter, userLimiter, ROLE_LIMITS };
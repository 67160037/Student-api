const rateLimit = require("express-rate-limit");
const { sendError } = require("./http");

// แบบฝึกหัดต่อยอดสัปดาห์ที่ 4 ข้อ 1: ทุกคำขอที่มี body ต้องเป็น application/json
function requireJson(req, res, next) {
  const methodsWithBody = ["POST", "PUT", "PATCH"];
  const contentType = (req.headers["content-type"] || "").split(";")[0].trim();
  if (methodsWithBody.includes(req.method) && contentType !== "application/json") {
    return sendError(
      res,
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "กรุณาส่งข้อมูลในรูปแบบ application/json",
    );
  }
  next();
}

// แบบฝึกหัดต่อยอดสัปดาห์ที่ 4 ข้อ 2: จำกัด POST /students ไม่เกิน 5 ครั้ง/นาที ต่อ IP
const createStudentLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // ปิด rate limit ระหว่างรันชุดทดสอบอัตโนมัติ (ตั้ง RATE_LIMIT_DISABLED=1)
  skip: () => process.env.RATE_LIMIT_DISABLED === "1",
  handler: (req, res) =>
    sendError(res, 429, "TOO_MANY_REQUESTS", "ส่งคำขอมากเกินไป กรุณารอสักครู่"),
});

module.exports = { requireJson, createStudentLimiter };

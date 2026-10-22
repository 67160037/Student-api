// gateway/generate-test-token.js (สคริปต์ชั่วคราวสำหรับทดสอบเท่านั้น)
require("dotenv").config();
const jwt = require("jsonwebtoken");

// payload ใช้คีย์ id/email/role เช่นเดียวกับ generateToken ในสัปดาห์ที่ 6
const token = jwt.sign(
  { id: 1, email: "test@example.com", role: "student" },
  process.env.JWT_SECRET,
  { expiresIn: "1h" },
);

console.log(token);

require("dotenv").config({ quiet: true });

// กัน test ล้มเมื่อ .env ไม่มีค่าเหล่านี้ (dotenv ไม่ทับค่าที่มีอยู่แล้ว)
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";

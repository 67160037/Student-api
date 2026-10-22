# บันทึกข้อสังเกตการทำปฏิบัติการ student-api (wk01-lab ถึง wk06-lab)

โปรเจกต์นี้ทำตาม `wkNN-lab.md` ทีละสัปดาห์แบบต่อยอดสะสม รวมแบบฝึกหัดต่อยอดทุกข้อที่มีโค้ด
แต่ละสัปดาห์มีสคริปต์ทดสอบอัตโนมัติแทน Postman/GraphiQL เขียนผลเป็นไฟล์ `test-results-wkNN.md` (UTF-8 with BOM)

รันทั้งหมด: `npm test` (= wk02 + wk04 + wk05 + wk06)
ตั้งค่าฐานข้อมูลครั้งแรก: `npm run db:setup`

---

## สัปดาห์ที่ 1 — REST + Express skeleton

- lab เขียนสร้าง Node ตรวจ `node -v` แล้ว `npm install express` — เวอร์ชันจริงที่ได้คือ **Express 5.2.1** (lab เขียนอิง v18 LTS ของ Node ไม่ใช่ Express) route `:id` ยังทำงานเหมือน Express 4
- ทำแบบฝึกหัดต่อยอดครบ: แยก `routes/` (Router), เพิ่ม resource `courses`, query string `?major=`, ตรวจ `name` ยาว >= 2 และกันชื่อซ้ำด้วย 409
- โครงสร้างสุดท้ายทำแบบฝึกหัดข้อ 1 (แยก Router) ไปเลย ไม่เก็บเวอร์ชัน single-file

## สัปดาห์ที่ 2 — REST vs GraphQL

- ใช้ `express-graphql@0.12.0` ตามที่ lab กำหนด npm เตือนว่า **deprecated** (แนะนำ `graphql-http`) แต่ทดสอบแล้วทำงานได้บน Express 5
- GraphQL ใช้ resolver ข้อมูลจำลองในหน่วยความจำแยกไฟล์ (`resolvers.js`) — ไม่ถูกย้ายไป MySQL ในสัปดาห์ที่ 5 เพราะ lab ไม่ได้สั่ง จึงยังเป็น in-memory จนถึงปัจจุบัน
- แบบฝึกหัดต่อยอดที่มีโค้ด: ข้อ 3 (เพิ่ม type `Instructor` + nested student->course->instructor), ข้อ 5 (argument `hasCourse`) ข้อ 2 (วัด payload) และ 4 (เขียนวิเคราะห์) เป็นงานสังเกต ไม่มีโค้ด

## สัปดาห์ที่ 3 — URI Schema มาตรฐาน RESTful

- รื้อ `routes/students.js`: `409` เมื่ออีเมลซ้ำ (เปลี่ยน key ที่ตรวจซ้ำจาก `name` เป็น `email`), เพิ่ม `PATCH`, ยุบ endpoint `/:id/full` เป็น `?include=courses`
- เพิ่ม helper `sendError()` (`lib/http.js`) — โครงสร้าง error เดียวทั้งระบบ `{ error: { code, message } }` (แบบฝึกหัดข้อ 2)
- เพิ่ม resource `enrollments` (แบบฝึกหัดข้อ 1): flat `GET /enrollments` + nested `POST/DELETE /students/:id/enrollments/:courseId`
- จัดทำ `URI-SCHEMA.md` และปรับปรุงต่อเนื่องทุกสัปดาห์
- ผลข้างเคียง: POST/PUT `/students` ต้องมี `email` ทำให้ต้องปรับสคริปต์ทดสอบสัปดาห์ที่ 1 ที่เดิมเช็ค name ซ้ำ

## สัปดาห์ที่ 4 — Middleware ความปลอดภัย

- ลำดับ middleware: `helmet` -> `cors` -> `morgan` -> `express.json({ limit: "10kb" })` -> `requireJson` -> routes -> 404 handler -> error-handling middleware
- error middleware อ่าน `err.status/err.statusCode` เพื่อไม่ให้ `413 PayloadTooLargeError` จาก `express.json` ถูกกลบเป็น 500
- แบบฝึกหัดที่มีโค้ด: ข้อ 1 (`requireJson` -> 415), ข้อ 2 (`express-rate-limit` -> POST /students จำกัด 5/นาที -> 429), ข้อ 3 (`name` > 100 -> 400)
- **rate limiter** มี `skip: () => process.env.RATE_LIMIT_DISABLED === "1"` — สคริปต์ทดสอบที่ยิง POST หลายครั้ง spawn เซิร์ฟเวอร์พร้อม env นี้ ยกเว้น test wk04 ที่เปิด limiter จริงเพื่อทดสอบ 429
- ขั้นตอน 3.5 lab บอกว่าระบบ "ยังไม่ตรวจชนิดข้อมูล" แต่โค้ดเราตรวจ `typeof name !== "string"` มาตั้งแต่สัปดาห์ที่ 1 จึงได้ 400 อยู่แล้ว
- ข้อ 4 (ย้าย helmet ไปท้าย) เป็นการทดลอง ไม่แตะโค้ดถาวร

## สัปดาห์ที่ 5 — MySQL migration

- MySQL อยู่ใน Docker container `mysql_db` (user `root`, pass `changeme_root_password`, port 3306) DB ชื่อ `student_api`
- ย้าย REST ทั้งหมด (students, courses, enrollments) จาก array in-memory ไป query ผ่าน connection pool (`db.js`, `connectionLimit: 10`)
- **ข้อควรระวังสำคัญ**: apply ไฟล์ `.sql` ผ่าน `docker exec -i mysql_db mysql ...` ต้องใส่ `--default-character-set=utf8mb4` ไม่งั้นภาษาไทยกลายเป็น mojibake (client default เป็น latin1) ใส่ไว้ใน `db:setup` และทุกสคริปต์ทดสอบแล้ว pool ตั้ง `charset: "utf8mb4"`
- `courses` เปลี่ยนสคีมาจาก `courseCode/courseName` (สัปดาห์ที่ 1) เป็น `course_name/credit/seat_available` ตามที่ lab กำหนดในตาราง SQL
- ลบ `lib/data.js` ทิ้ง (in-memory ไม่ใช้แล้ว)
- transaction ใน `POST /students/:id/enrollments`: `SELECT ... FOR UPDATE` -> ตรวจ seat -> INSERT -> UPDATE seat -> commit rollback เมื่อ course ไม่มี / seat เต็ม / ชน UNIQUE
- แบบฝึกหัดที่มีโค้ด: ข้อ 1 (`GET /students/:id/courses` ด้วย JOIN), ข้อ 3 (`DELETE enrollment` คืน seat ด้วย transaction), ข้อ 4 (`test-pool.js` — 20 query ขนาน vs ทีละคำขอ) ข้อ 2 มี route `/enrollments/unsafe` ไว้ให้เห็นความเสี่ยง data inconsistency แต่คำอธิบายเป็นงานเขียน
- สคริปต์ทดสอบ wk01 และ wk03 ย้ายไป `_archived-tests/` เพราะทดสอบ contract in-memory (id ที่คาดเดาได้, enrollments ในหน่วยความจำ) ซึ่ง migration แทนที่ไปแล้ว — wk05 ครอบคลุมแทน

## สัปดาห์ที่ 6 — Authentication + RBAC

- เพิ่มตาราง `users` (email, password_hash, role ENUM('student','admin')) เข้า `schema.sql`
- ทำใหม่ทั้งหมด: `auth-helpers.js` (bcrypt cost 10, jwt.sign), `middlewares/auth.js` (`authenticateToken`, `authorizeRole(...)` — ใช้ `sendError` ให้ error format ตรงทั้งระบบ), `routes/auth.js` (register/login/me/change-password)
- `register` กำหนด `role = 'student'` เสมอ ไม่รับจาก client (กัน Mass Assignment) — admin คนแรกต้องเลื่อน role ผ่าน SQL โดยตรง
- `login` เรียก `verifyPassword` เสมอแม้ไม่พบ user (ใส่ hash dummy) เพื่อลด timing side-channel
- ป้องกัน route เดิม: `DELETE /students/:id` -> ต้อง admin `PUT /students/:id` -> object-level auth (แบบฝึกหัดข้อ 2: เพิ่มคอลัมน์ `students.user_id` FK -> `users.id`, แก้ได้เฉพาะระเบียนที่ `user_id` ตรงกับตนเอง, admin ยกเว้น)
- แบบฝึกหัดที่มีโค้ด: ข้อ 1 (`PATCH /auth/change-password`), ข้อ 2 (object-level auth) ข้อ 3 (token หมดอายุ) และ 4 (logout stateless ทำไม่ได้) เป็นการทดลอง/สังเกต
- ไม่ seed แถว `users` แบบ hash ตายตัว — สคริปต์ทดสอบ register ผ่าน API เอง (bcrypt hash ตายตัวใน seed เสี่ยงไม่ตรงรหัสจริง)
- ผลข้างเคียง: test wk05 กรณี cascade delete เปลี่ยนจากเรียก `DELETE /students/2` เป็นลบตรงที่ DB เพราะ endpoint ถูกป้องกันด้วย auth แล้ว

## สัปดาห์ที่ 7 — Caching + Client-Oriented API

- Redis อยู่ใน Docker container `redis-server` (port 6379) `.env`: `REDIS_URL=redis://localhost:6379`
- `index.js` เรียก `connectRedis()` ก่อน `app.listen` — ถ้าต่อ Redis ไม่ได้ เซิร์ฟเวอร์ไม่เริ่มทำงาน (`process.exit(1)`) ทำให้เวลา startup นานขึ้น จึงต้องเพิ่ม `sleep` ในสคริปต์ทดสอบทั้งหมดจาก 2000 -> 3500 ms
- `GET /students`: ทำ pagination/filter/sort + cache key รวมพารามิเตอร์ (ทำแบบฝึกหัดข้อ 2 ไปเลย ไม่เก็บเวอร์ชัน key `students:all` แบบง่าย) ล้างแคชด้วย `redisClient.keys("students:list:*")` + `del` — pattern scan ยอมรับได้สำหรับ teaching app
- `sort` allowlist `["id","name","major","created_at"]` — ค่านอก allowlist fallback `id` ทำให้แทรก `field ${order}` ลง SQL ได้อย่างปลอดภัย
- v2: `routes/v2.js` — response `{ items, count, meta }` (ต่างจาก v1 `{ message, data, pagination }`) คง pagination/sort ไว้ ไม่ปล่อย endpoint คืนทั้งตารางตามข้อควรระวังใน lab
- แบบฝึกหัดที่มีโค้ด: ข้อ 1 (courses cache TTL 300s), ข้อ 2 (cache key รวมพารามิเตอร์), ข้อ 3 (`deprecationNotice` middleware แนบ `Deprecation: @<unix>` + `Link` ให้ทุก response ของ `/api/v1`)
- ขั้นตอน 2.5 (วัด response time) เป็นงานบันทึกของนิสิต — สรุปแนวทางไว้ท้าย `test-results-wk07.md`
- สคริปต์ทดสอบทั้งหมด (wk02/05/06/07) เพิ่ม `redis-cli FLUSHALL` หลัง re-seed เพื่อไม่ให้ cache ค้างจากรันก่อนหน้าทำให้ผลเพี้ยน
- `npm run db:setup` ต้องมี **ทั้ง** container `mysql_db` และ `redis-server` รันอยู่ก่อนรัน `npm test`

---

## รูปแบบที่ยึดตลอดโปรเจกต์

- ทุก error response: `{ error: { code, message } }` ผ่าน `sendError()`
- ทุกสคริปต์ทดสอบ re-seed ฐานข้อมูลก่อนรัน (ตั้งแต่มี MySQL) และ spawn เซิร์ฟเวอร์เองในโปรเซสแยก
- ข้อมูลจำลองภาษาไทย ใช้ชื่อเดียวกันทุกสัปดาห์ (สมชาย ใจดี / สมหญิง รักเรียน / วิชัย ตั้งใจเรียน)
- แบบฝึกหัดต่อยอดที่เป็น "เขียนวิเคราะห์" หรือ "สังเกตผล" ไม่มีโค้ด บันทึกไว้ในไฟล์ `test-results-wkNN.md` ท้ายตาราง

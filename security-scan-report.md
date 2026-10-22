# รายงานผลการสแกนความปลอดภัย student-api

**นิสิต:** พิชชาพร (67160037) | **ระบบ:** student-api (Express 5 + MySQL + Redis)

## 1. ผลสแกนด้วย OWASP ZAP

> ส่วนนี้ต้องกรอกจากผลสแกนจริงบนเครื่องของตนเอง (ZAP เป็นโปรแกรมแบบ GUI) ยังไม่มีผลสแกนในไฟล์นี้

วิธีทำ: รัน `npm run dev` ให้เซิร์ฟเวอร์ทำงานก่อน → เปิด ZAP → Automated Scan ใส่ URL `http://localhost:3000` → Attack → รอจนเสร็จ → แท็บ Alerts แล้วกรอกตาราง

| ระดับความเสี่ยง | ช่องโหว่ที่พบ | Endpoint | ข้อเสนอแนะการแก้ไข | สถานะ |
| --- | --- | --- | --- | --- |
| (กรอกจาก ZAP) | | | | |

- วันที่สแกน: (กรอก)
- เวอร์ชัน ZAP: (กรอก)
- จำนวน alert แยกตามระดับ High / Medium / Low / Informational: (กรอก)

## 2. ผลตรวจเบื้องต้นด้วยมือ (curl ยิงเซิร์ฟเวอร์ที่รันบนเครื่องทดสอบ ไม่ใช่ผลของ ZAP)

| ระดับความเสี่ยง | สิ่งที่พบ | Endpoint | ข้อเสนอแนะ | สถานะ |
| --- | --- | --- | --- | --- |
| สูงถึงกลาง | `POST`, `PUT`, `PATCH /students` ไม่ต้องล็อกอิน ยิง `PUT` และ `PATCH /api/v1/students/1` โดยไม่มี token ได้ `200` ทั้งคู่ และแก้ข้อมูลได้ (มีแค่ `DELETE` ที่ตรวจ role admin) | `/api/v1/students`, `/api/v1/students/{id}` | เพิ่ม `authenticateToken` และ `authorizeRole("admin")` (หรือ role ที่เหมาะสม) ให้ route เขียนข้อมูลทั้งหมด | ยังไม่แก้ (ต้องปรับ test และ Postman collection ตาม) |
| ต่ำ | error ของ JSON ที่ผิดรูปแบบเปิดเผยข้อความภายในของ parser (`Expected property name or '}' in JSON at position 1`) | ทุก endpoint ที่รับ body | ให้ error handler ตอบข้อความกลางสำหรับ `entity.parse.failed` | ยังไม่แก้ |
| ข้อมูลทั่วไป | หน้า `/graphql` (GraphiQL เปิดด้วย `graphiql: true`) เข้าถึงได้โดยไม่ล็อกอิน | `/graphql` | ปิด GraphiQL เมื่อ `NODE_ENV=production` | ยังไม่แก้ |
| ผ่าน | SQL injection: ส่ง `'; DROP TABLE students; --` ไปที่ `POST /students` และ `POST /auth/login` ตารางไม่ถูกลบ ข้อความถูกเก็บเป็นข้อมูลปกติ (parameterized query) | `/api/v1/students`, `/api/v1/auth/login` | ไม่ต้องแก้ | - |
| ผ่าน | security header จาก helmet ครบ (CSP, X-Content-Type-Options, X-Frame-Options, HSTS ฯลฯ) และไม่มี `X-Powered-By` | ทุก endpoint | ไม่ต้องแก้ | - |
| ผ่าน | CORS ตอบเฉพาะ origin ที่กำหนดใน `ALLOWED_ORIGIN` ไม่ตอบ origin แปลกปลอม | ทุก endpoint | ไม่ต้องแก้ | - |
| ผ่าน | brute-force login ถูกจำกัด: ครั้งที่ 6 ได้ `429` | `/api/v1/auth/login` | ไม่ต้องแก้ | - |

## 3. สรุป

(กรอกหลังสแกนด้วย ZAP: ช่องโหว่ระดับ Medium ขึ้นไปที่พบและสถานะการแก้ไข)
# Student API Documentation

เอกสารอ้างอิงการใช้งาน API ของโปรเจกต์ `student-api` ซึ่งให้บริการทั้ง REST API และ GraphQL

## สารบัญ endpoint

| Method | Endpoint | ต้อง login | คำอธิบาย |
|---|---|:---:|---|
| GET | `/` | - | ตรวจสอบว่า API ทำงานอยู่ (health check) |
| POST | `/api/v1/auth/register` | - | สมัครสมาชิกใหม่ (role เป็น student เสมอ) |
| POST | `/api/v1/auth/login` | - | เข้าสู่ระบบ รับ JWT กลับมา |
| GET | `/api/v1/auth/me` | ใช่ | ดูข้อมูลผู้ใช้จาก token ปัจจุบัน |
| PATCH | `/api/v1/auth/change-password` | ใช่ | เปลี่ยนรหัสผ่านของตนเอง |
| GET | `/api/v1/students` | - | ดึงรายการนิสิต (pagination, filter, sort, cache) |
| GET | `/api/v1/students/:id` | - | ดึงข้อมูลนิสิตรายบุคคล (`?include=courses` ได้) |
| GET | `/api/v1/students/:id/courses` | - | ดึงรายวิชาที่นิสิตคนนั้นลงทะเบียน |
| POST | `/api/v1/students` | - | เพิ่มนิสิตใหม่ (rate limit 5 ครั้ง/นาที/IP) |
| PUT | `/api/v1/students/:id` | ใช่ | แก้ไขนิสิตทั้งระเบียน (เจ้าของหรือ admin เท่านั้น) |
| PATCH | `/api/v1/students/:id` | - | แก้ไขนิสิตบางฟิลด์ |
| DELETE | `/api/v1/students/:id` | ใช่ (admin) | ลบนิสิต |
| GET | `/api/v1/courses` | - | ดึงรายวิชาทั้งหมด (cache 300 วินาที) |
| GET | `/api/v1/courses/:id` | - | ดึงรายวิชารายตัว |
| POST | `/api/v1/courses` | - | เพิ่มรายวิชาใหม่ |
| PUT | `/api/v1/courses/:id` | - | แก้ไขรายวิชาทั้งระเบียน |
| DELETE | `/api/v1/courses/:id` | - | ลบรายวิชา |
| GET | `/api/v1/enrollments` | - | ดึงรายการลงทะเบียนทั้งหมด |
| POST | `/api/v1/students/:id/enrollments` | - | ลงทะเบียนเรียน (ใช้ transaction) |
| POST | `/api/v1/students/:id/enrollments/unsafe` | - | ลงทะเบียนเรียนแบบไม่ใช้ transaction (สาธิตความเสี่ยง) |
| DELETE | `/api/v1/students/:id/enrollments/:courseId` | - | ยกเลิกการลงทะเบียน คืนที่นั่ง |
| GET | `/api/v2/students` | - | รายการนิสิต v2 (response ไม่มี message/data wrapper) |
| POST/GET | `/graphql` | - | GraphQL API และ GraphiQL |

## เริ่มต้นใช้งาน

### รันระบบ

ต้องมี MySQL และ Redis ทำงานอยู่ก่อน เพราะเซิร์ฟเวอร์จะเชื่อมต่อ Redis ก่อนเปิดรับ request

```bash
npm install
npm run db:setup
npm run dev
```

ค่าเริ่มต้นของเซิร์ฟเวอร์คือ `http://localhost:3000` หรือใช้ค่าจากตัวแปร `PORT`

### Environment variables

| ตัวแปร | ใช้สำหรับ |
| --- | --- |
| `PORT` | พอร์ตของ HTTP server (ค่าเริ่มต้น `3000`) |
| `DB_HOST` | host ของ MySQL |
| `DB_PORT` | พอร์ต MySQL (ค่าเริ่มต้น `3306`) |
| `DB_USER` | ผู้ใช้ MySQL |
| `DB_PASSWORD` | รหัสผ่าน MySQL |
| `DB_NAME` | ชื่อฐานข้อมูล |
| `REDIS_URL` | URL ของ Redis เช่น `redis://localhost:6379` |
| `JWT_SECRET` | secret สำหรับ sign และ verify JWT |
| `JWT_EXPIRES_IN` | อายุของ JWT เช่น `1h` หรือ `7d` |
| `ALLOWED_ORIGIN` | origin ที่อนุญาตโดย CORS |
| `RATE_LIMIT_DISABLED` | ตั้งเป็น `1` เพื่อปิด rate limit ระหว่างทดสอบ |

## ข้อกำหนดทั่วไป

- REST endpoint ใช้ JSON เป็นหลัก และ response มี encoding เป็น UTF-8
- ทุก `POST`, `PUT` และ `PATCH` ต้องส่ง header `Content-Type: application/json`
- body มีขนาดไม่เกิน 10 KB
- header `Authorization` ใช้รูปแบบ `Bearer <JWT>` สำหรับ endpoint ที่ต้อง login
- error response ใช้รูปแบบเดียวกันทั้งหมด:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "รายละเอียดข้อผิดพลาด"
  }
}
```

การส่ง body ด้วย Content-Type อื่นจะได้ `415 UNSUPPORTED_MEDIA_TYPE` และ route ที่ไม่มีอยู่จะได้ `404 ROUTE_NOT_FOUND`

## Health check

### `GET /`

ตรวจสอบว่า API ทำงานอยู่

**ตัวอย่าง response `200 OK`**

```json
{
  "message": "Student API พร้อมใช้งาน"
}
```

## REST API v1

Base path: `/api/v1`

ทุก response ภายใต้ v1 จะมี header สำหรับแจ้งการเลิกใช้งานในอนาคต:

```http
Deprecation: @1735689600
Link: </api/v2/students>; rel="successor-version"
```

### Students

#### `GET /api/v1/students`

ดึงรายการนิสิต รองรับ filter, pagination และ sorting

| Query parameter | ค่าเริ่มต้น | รายละเอียด |
| --- | ---: | --- |
| `page` | `1` | หน้าที่ต้องการ ค่าต่ำสุดคือ `1` |
| `limit` | `10` | จำนวนรายการต่อหน้า สูงสุด `100` |
| `major` | - | กรองตามสาขา |
| `sort` | `id` | `id`, `name`, `major` หรือ `created_at`; ค่าอื่น fallback เป็น `id` |
| `order` | `ASC` | ใช้ `desc` เพื่อเรียงจากมากไปน้อย ค่าอื่นเป็น `ASC` |

**ตัวอย่าง request**

```http
GET /api/v1/students?page=1&limit=10&major=วิทยาการคอมพิวเตอร์&sort=name&order=asc
```

**ตัวอย่าง response `200 OK`**

```json
{
  "message": "สำเร็จ (จากฐานข้อมูล)",
  "data": [
    {
      "id": 1,
      "name": "สมชาย ใจดี",
      "major": "วิทยาการคอมพิวเตอร์",
      "email": "somchai@example.com",
      "user_id": null,
      "created_at": "2026-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

ค่า `message` จะเป็น `สำเร็จ (จาก cache)` เมื่อข้อมูลมาจาก Redis โดย cache รายการนิสิตมีอายุ 60 วินาที

#### `GET /api/v1/students/:id`

ดึงข้อมูลนิสิตรายบุคคล ใช้ `?include=courses` เพื่อแนบรายวิชาที่ลงทะเบียน

**ตัวอย่าง response `200 OK`**

```json
{
  "message": "สำเร็จ",
  "data": {
    "id": 1,
    "name": "สมชาย ใจดี",
    "major": "วิทยาการคอมพิวเตอร์",
    "email": "somchai@example.com",
    "user_id": null,
    "created_at": "2026-01-01T00:00:00.000Z",
    "courses": []
  }
}
```

#### `GET /api/v1/students/:id/courses`

ดึงรายวิชาที่นิสิตลงทะเบียน หากไม่พบนิสิตจะตอบ `404 NOT_FOUND`

#### `POST /api/v1/students`

สร้างนิสิตใหม่ อนุญาต field `name`, `major` และ `email` โดยทั้งสาม field จำเป็น และ `name` ต้องเป็นข้อความยาว 2-100 ตัวอักษร

```json
{
  "name": "วิชัย ตั้งใจเรียน",
  "major": "วิทยาการคอมพิวเตอร์",
  "email": "wichai@example.com"
}
```

สำเร็จตอบ `201 Created` พร้อม `data` ของนิสิตใหม่ อีเมลซ้ำตอบ `409 DUPLICATE_EMAIL` และ endpoint นี้จำกัด 5 requests ต่อนาทีต่อ IP โดยค่าเริ่มต้น

#### `PUT /api/v1/students/:id`

แก้ไขข้อมูลนิสิตทั้งระเบียน ต้องส่ง `name`, `major`, `email` ครบ และต้องใช้ JWT ผู้ใช้ต้องเป็นเจ้าของระเบียน (`students.user_id` ตรงกับ `id` ใน token) หรือเป็น `admin`

ตอบ `401` เมื่อไม่มี/ใช้ token ไม่ได้, `403 FORBIDDEN` เมื่อไม่มีสิทธิ์ และ `409 DUPLICATE_EMAIL` เมื่ออีเมลซ้ำ

#### `PATCH /api/v1/students/:id`

แก้ไขบาง field โดยเลือกส่งจาก `name`, `major`, `email` อย่างน้อยหนึ่ง field หากไม่ส่ง field ใดเลยจะได้ `400 VALIDATION_ERROR`

#### `DELETE /api/v1/students/:id`

ลบนิสิต ต้องมี JWT และ role `admin` เท่านั้น การลบจะ cascade ไปยัง enrollment ที่เกี่ยวข้อง

### Courses

#### `GET /api/v1/courses`

ดึงรายวิชาทั้งหมด response อยู่ใน `data` และ cache Redis 300 วินาที

```json
{
  "message": "สำเร็จ (จากฐานข้อมูล)",
  "data": [
    {
      "id": 1,
      "course_name": "การเขียนโปรแกรมเบื้องต้น",
      "credit": 3,
      "seat_available": 30
    }
  ]
}
```

#### `GET /api/v1/courses/:id`

ดึงรายวิชารายตัว หากไม่พบตอบ `404 NOT_FOUND`

#### `POST /api/v1/courses`

สร้างรายวิชา โดย `course_name` และ `credit` จำเป็น ส่วน `seat_available` ไม่บังคับและมีค่าเริ่มต้น `30`

```json
{
  "course_name": "โครงสร้างข้อมูล",
  "credit": 3,
  "seat_available": 40
}
```

#### `PUT /api/v1/courses/:id`

แก้ไขรายวิชา ต้องส่ง `course_name`, `credit` และ `seat_available` ครบ

#### `DELETE /api/v1/courses/:id`

ลบรายวิชา หากมี enrollment จะถูกลบตาม foreign key cascade

### Enrollments

#### `GET /api/v1/enrollments`

ดึง enrollment ทั้งหมด เรียงตาม `student_id` และ `course_id`

```json
{
  "message": "สำเร็จ",
  "data": [
    { "student_id": 1, "course_id": 2 }
  ]
}
```

#### `POST /api/v1/students/:id/enrollments`

ลงทะเบียนนิสิตในรายวิชา โดยตรวจที่นั่งและบันทึกด้วย database transaction

```json
{
  "courseId": 2
}
```

สำเร็จตอบ `201 Created` หากไม่พบรายวิชาได้ `404 COURSE_NOT_FOUND`, ที่นั่งเต็มได้ `409 SEAT_FULL`, ลงทะเบียนซ้ำได้ `409 ALREADY_ENROLLED` และ foreign key ไม่ถูกต้องได้ `404 NOT_FOUND`

#### `POST /api/v1/students/:id/enrollments/unsafe`

ทำงานเหมือน endpoint ข้างต้น แต่ไม่ใช้ transaction มีไว้สำหรับเปรียบเทียบความเสี่ยงด้านความสอดคล้องของข้อมูล

#### `DELETE /api/v1/students/:id/enrollments/:courseId`

ยกเลิกการลงทะเบียนและคืนที่นั่ง 1 ที่ ใช้ transaction หากไม่พบ enrollment ได้ `404 NOT_FOUND`

## REST API v2

### `GET /api/v2/students`

ดึงรายการนิสิตด้วย query parameter เดียวกับ v1: `page`, `limit`, `major`, `sort`, `order`

โครงสร้าง response ไม่มี `message` และ `data` wrapper:

```json
{
  "items": [
    {
      "id": 1,
      "name": "สมชาย ใจดี",
      "major": "วิทยาการคอมพิวเตอร์",
      "email": "somchai@example.com"
    }
  ],
  "count": 1,
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

v2 ไม่มี `Deprecation` และ `Link` header แบบ v1

## Authentication

### `POST /api/v1/auth/register`

สมัครสมาชิก ต้องส่ง `email` และ `password` ระบบกำหนด role เป็น `student` เสมอ และไม่รับ `role` จาก client

```json
{
  "email": "student@example.com",
  "password": "secret123"
}
```

สำเร็จตอบ `201 Created` พร้อม `{ id, email, role }` อีเมลซ้ำได้ `409 DUPLICATE_EMAIL`

### `POST /api/v1/auth/login`

เข้าสู่ระบบด้วย email และ password

```json
{
  "email": "student@example.com",
  "password": "secret123"
}
```

สำเร็จตอบ `200 OK` พร้อม JWT:

```json
{
  "message": "เข้าสู่ระบบสำเร็จ",
  "token": "<JWT>"
}
```

ใช้ token กับ request ถัดไป:

```http
Authorization: Bearer <JWT>
```

### `GET /api/v1/auth/me`

ดูข้อมูลจาก JWT ของผู้ใช้ปัจจุบัน ต้อง login ก่อน

### `PATCH /api/v1/auth/change-password`

เปลี่ยนรหัสผ่าน ต้องมี JWT และส่ง body:

```json
{
  "oldPassword": "secret123",
  "newPassword": "new-secret456"
}
```

รหัสผ่านเดิมผิดตอบ `401 INVALID_CREDENTIALS` และไม่พบบัญชีตอบ `404 NOT_FOUND`

## GraphQL API

GraphQL endpoint คือ `POST /graphql` และเปิด GraphiQL ที่ `GET /graphql`

GraphQL ในโปรเจกต์นี้ใช้ข้อมูลจำลองในหน่วยความจำจาก `resolvers.js` แยกจาก REST ซึ่งใช้ MySQL ดังนั้นข้อมูลของสอง API อาจไม่ตรงกัน และข้อมูล GraphQL จะหายเมื่อ process restart

### ตัวอย่าง query

```graphql
query {
  students(major: "วิทยาการคอมพิวเตอร์", sortBy: "name") {
    id
    name
    major
    email
    phone
    courses {
      id
      courseName
      credit
      instructor {
        id
        name
      }
    }
  }
  studentCount
}
```

### Query ที่รองรับ

| Field | Arguments | ผลลัพธ์ |
| --- | --- | --- |
| `student` | `id: ID!` | นิสิตรายคน หรือ `null` |
| `students` | `major`, `sortBy`, `hasCourse` | รายการนิสิต; `sortBy: "name"` เรียงตามชื่อ |
| `studentCount` | - | จำนวนไฟล์นิสิตในหน่วยความจำ |
| `course` | `id: ID!` | รายวิชารายคน หรือ `null` |
| `courses` | `minCredit` | รายวิชาโดยกรองหน่วยกิตขั้นต่ำได้ |
| `searchStudents` | `keyword: String!` | ค้นจากชื่อหรือสาขา |
| `instructors` | - | รายชื่ออาจารย์พร้อมรายวิชา |

### Mutation ที่รองรับ

```graphql
mutation {
  createStudent(input: {
    name: "นักศึกษาใหม่"
    major: "วิทยาการคอมพิวเตอร์"
    email: "new@example.com"
    phone: "080-000-0000"
    courseIds: [101]
  }) {
    id
    name
    courses { id courseName }
  }
}
```

มี mutation คือ `createStudent`, `updateStudent` และ `deleteStudent` โดย `updateStudent` คืน `null` เมื่อไม่พบ id และ `deleteStudent` คืน `{ success, message }`

## Status codes ที่พบบ่อย

| Status | ความหมาย |
| ---: | --- |
| `200` | สำเร็จ |
| `201` | สร้างข้อมูลสำเร็จ |
| `400` | ข้อมูล request ไม่ถูกต้อง |
| `401` | ไม่มี token หรือ token/credential ไม่ถูกต้อง |
| `403` | ไม่มีสิทธิ์ |
| `404` | ไม่พบ resource หรือ route |
| `409` | ข้อมูลขัดแย้ง เช่น email ซ้ำ หรือ enrollment ซ้ำ |
| `415` | Content-Type ไม่ใช่ `application/json` |
| `429` | เรียก `POST /api/v1/students` เกิน rate limit |
| `500` | ข้อผิดพลาดภายในระบบ |
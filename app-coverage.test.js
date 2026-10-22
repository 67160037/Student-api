jest.mock("./db");
jest.mock("./cache", () => ({
  redisClient: {
    get: jest.fn(),
    setEx: jest.fn(),
    keys: jest.fn(),
    del: jest.fn(),
  },
  connectRedis: jest.fn(),
}));

const request = require("supertest");
const app = require("./app");
const pool = require("./db");
const { redisClient } = require("./cache");
const { generateToken, hashPassword } = require("./auth-helpers");

const bearer = (role) => ({
  Authorization: `Bearer ${generateToken({ id: 1, email: "a@b.c", role })}`,
});
const dupError = () =>
  Object.assign(new Error("dup"), { code: "ER_DUP_ENTRY" });

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

// ฟังก์ชันช่วยจำลอง connection สำหรับ Transaction ของ enrollments
function mockConnection(queryResults, failWith) {
  const connection = {
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
    query: jest.fn(),
  };
  queryResults.forEach((r) => connection.query.mockResolvedValueOnce(r));
  if (failWith) connection.query.mockRejectedValueOnce(failWith);
  pool.getConnection.mockResolvedValue(connection);
  return connection;
}

// T01: เพิ่ม branch → L232 if(false)+ทั้ง 3 operand, L247 if(false), L255-257 ternary (ใช้ค่าเดิม name/major, ใช้ค่าใหม่ email), L271 if(true)
test("T01 PATCH: name/major/email เลือกค่าเดิม-ค่าใหม่, และ email ซ้ำ", async () => {
  pool.query
    .mockResolvedValueOnce([
      [{ id: 1, name: "O", major: "IT", email: "o@b.c" }],
    ])
    .mockRejectedValueOnce(dupError());
  const res = await request(app)
    .patch("/api/v1/students/1")
    .send({ email: "x@b.c" });
  expect(res.status).toBe(409);
});

// T02: เพิ่ม branch → L158 if(false)+ทั้ง 3 operand, L175 if(false)
test("T02 POST สำเร็จ: ผ่าน validation และไม่มี cache ให้ล้าง", async () => {
  pool.query.mockResolvedValueOnce([{ insertId: 5 }]);
  redisClient.keys.mockResolvedValueOnce([]);
  const res = await request(app)
    .post("/api/v1/students")
    .send({ name: "Alice", major: "IT", email: "alice@example.com" });
  expect(res.status).toBe(201);
  expect(redisClient.del).not.toHaveBeenCalled();
});

// T03: เพิ่ม branch → L68 major||"all" ทั้งสองฝั่ง, L73 if(false), L84 if(false)
test("T03 GET /students: ไม่มี cache และไม่ระบุ major", async () => {
  pool.query
    .mockResolvedValueOnce([[{ id: 1 }]])
    .mockResolvedValueOnce([[{ total: 1 }]]);
  const res = await request(app).get("/api/v1/students");
  expect(res.status).toBe(200);
  expect(res.body.message).toContain("ฐานข้อมูล");
  expect(redisClient.setEx).toHaveBeenCalled();
});

// T04: เพิ่ม branch → L197 if(false)+ทั้ง 2 operand, L212 if(true)
test("T04 PUT: ผ่าน validation แต่ไม่พบ id (affectedRows = 0)", async () => {
  pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
  const res = await request(app)
    .put("/api/v1/students/1")
    .send({ name: "A", major: "IT" });
  expect(res.status).toBe(404);
});

// T05: เพิ่ม branch → L513 ternary ฝั่ง non-500, err.type||"ERROR" ทั้งสองฝั่ง, L515 ternary ฝั่ง non-500
test("T05 error handler: status ไม่ใช่ 500 และไม่มี err.type", async () => {
  pool.query.mockRejectedValueOnce(
    Object.assign(new Error("Service Unavailable"), { status: 503 }),
  );
  const res = await request(app).get("/api/v1/students/1");
  expect(res.status).toBe(503);
  expect(res.body.error.code).toBe("ERROR");
});

// T06: เพิ่ม branch → L321 if(false), L328 if(false), L349 if(true)
test("T06 ลงทะเบียนเรียนซ้ำ (ER_DUP_ENTRY)", async () => {
  mockConnection([[[{ id: 101, seat_available: 5 }]]], dupError());
  const res = await request(app)
    .post("/api/v1/students/1/enrollments")
    .send({ courseId: 101 });
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe("ALREADY_ENROLLED");
});

// T07: เพิ่ม branch → L126 if(false), L135 if(false)
test("T07 GET /students/:id พบข้อมูล ไม่ include courses", async () => {
  pool.query.mockResolvedValueOnce([[{ id: 1, name: "A" }]]);
  const res = await request(app).get("/api/v1/students/1");
  expect(res.status).toBe(200);
  expect(res.body.data.courses).toBeUndefined();
});

// T08: เพิ่ม branch → L255 ternary ฝั่งใช้ค่าใหม่ (name), L257 ternary ฝั่งใช้ค่าเดิม (email)
test("T08 PATCH: ส่งเฉพาะ name", async () => {
  pool.query
    .mockResolvedValueOnce([
      [{ id: 1, name: "Old", major: "IT", email: "o@b.c" }],
    ])
    .mockResolvedValueOnce([{}])
    .mockResolvedValueOnce([[{ id: 1, name: "New" }]]);
  const res = await request(app)
    .patch("/api/v1/students/1")
    .send({ name: "New" });
  expect(res.status).toBe(200);
  expect(pool.query.mock.calls[1][1]).toEqual(["New", "IT", "o@b.c", "1"]);
});

// T09: เพิ่ม branch → L84 if(true)
test("T09 GET /students?major=IT", async () => {
  pool.query
    .mockResolvedValueOnce([[{ id: 1 }]])
    .mockResolvedValueOnce([[{ total: 1 }]]);
  const res = await request(app).get("/api/v1/students?major=IT");
  expect(res.status).toBe(200);
  expect(pool.query.mock.calls[0][0]).toContain("WHERE major = ?");
});

// T10: เพิ่ม branch → L73 if(true)
test("T10 GET /students พบข้อมูลใน cache", async () => {
  redisClient.get.mockResolvedValueOnce(
    JSON.stringify({ data: [], pagination: {} }),
  );
  const res = await request(app).get("/api/v1/students");
  expect(res.status).toBe(200);
  expect(res.body.message).toContain("cache");
  expect(pool.query).not.toHaveBeenCalled();
});

// T11: เพิ่ม branch → L126 if(true)
test("T11 GET /students/:id ไม่พบข้อมูล → 404", async () => {
  pool.query.mockResolvedValueOnce([[]]);
  const res = await request(app).get("/api/v1/students/999");
  expect(res.status).toBe(404);
});
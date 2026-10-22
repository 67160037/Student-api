// แบบฝึกหัดต่อยอดข้อ 1 และข้อ 3 (mock ฐานข้อมูลและ Redis)
jest.mock("./db");
jest.mock("./cache", () => ({
  redisClient: { get: jest.fn(), setEx: jest.fn(), keys: jest.fn(), del: jest.fn() },
  connectRedis: jest.fn(),
}));

const request = require("supertest");
const app = require("./app");
const pool = require("./db");
const { redisClient } = require("./cache");

beforeEach(() => {
  jest.resetAllMocks();
  redisClient.keys.mockResolvedValue([]);
});

describe("ข้อ 1: maxCredits ตาม studentStatus (POST /students/:id/enrollments)", () => {
  const post = (body) =>
    request(app).post("/api/v1/students/1/enrollments").send(body);

  test("probation เกิน 22 หน่วยกิต ถูกปฏิเสธ 400", async () => {
    const res = await post({ courseId: 101, studentStatus: "probation", maxCredits: 23 });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe("maxCredits");
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  test("probation 22 หน่วยกิต ผ่าน validation", async () => {
    const connection = {
      beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
      query: jest.fn()
        .mockResolvedValueOnce([[{ id: 101, seat_available: 5 }]])
        .mockResolvedValue([{}]),
    };
    pool.getConnection.mockResolvedValue(connection);
    const res = await post({ courseId: 101, studentStatus: "probation", maxCredits: 22 });
    expect(res.status).toBe(201);
  });

  test("สถานะปกติ 25 หน่วยกิต ผ่าน แต่ 26 ถูกปฏิเสธ", async () => {
    const bad = await post({ courseId: 101, maxCredits: 26 });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].message).toContain("25");
  });

  test("studentStatus ที่ไม่รู้จักถูกปฏิเสธ", async () => {
    const res = await post({ courseId: 101, studentStatus: "vip" });
    expect(res.status).toBe(400);
  });
});

describe("ข้อ 3: SQL injection ถูกส่งเป็นพารามิเตอร์ ไม่ถูกต่อเป็นคำสั่ง", () => {
  test("ชื่อที่มี SQL ถูกส่งเป็นค่า (?) และไม่มีคำสั่ง DROP ในข้อความ query", async () => {
    pool.query.mockResolvedValueOnce([{ insertId: 7 }]);
    const payload = "'; DROP TABLE students; --";
    const res = await request(app)
      .post("/api/v1/students")
      .send({ name: payload, major: "IT", email: "inj@example.com" });

    expect(res.status).toBe(201);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toBe("INSERT INTO students (name, major, email) VALUES (?, ?, ?)");
    expect(sql).not.toMatch(/DROP/i);
    expect(params[0]).toBe(payload);
  });
});
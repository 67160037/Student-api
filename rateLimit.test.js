// แบบฝึกหัดต่อยอดข้อ 2 และข้อ 5: ต้องแยกไฟล์ และตั้ง NODE_ENV เป็น production ก่อน require เพื่อใช้โควตาจริง
// (Jest แยก module registry ต่อไฟล์ จึงไม่กระทบ test ไฟล์อื่นที่ใช้โควตา test)
process.env.NODE_ENV = "production";

jest.mock("./db");
jest.mock("./cache", () => ({
  redisClient: { get: jest.fn(), setEx: jest.fn(), keys: jest.fn(), del: jest.fn() },
  connectRedis: jest.fn(),
}));

const request = require("supertest");
const app = require("./app");
const pool = require("./db");
const { generateToken } = require("./auth-helpers");
const { ROLE_LIMITS } = require("./middlewares/rateLimiter");

afterAll(() => {
  process.env.NODE_ENV = "test";
});

test("ข้อ 5: login ผิดรหัสเกิน 5 ครั้งต่อเนื่อง ครั้งที่ 6 ได้ 429 พร้อม header RateLimit", async () => {
  pool.query.mockResolvedValue([[]]); // ไม่พบผู้ใช้ → 401
  const send = () =>
    request(app).post("/api/v1/auth/login").send({ email: "x@example.com", password: "wrong" });

  for (let i = 1; i <= 5; i++) {
    expect((await send()).status).toBe(401);
  }
  const blocked = await send();
  expect(blocked.status).toBe(429);
  expect(blocked.body.error.code).toBe("TOO_MANY_REQUESTS");
  expect(blocked.headers["ratelimit"]).toContain("remaining=0");
});

test("ข้อ 2: student ได้โควตา 30 ครั้ง ส่วน admin ได้มากกว่า (ใช้ /auth/me)", async () => {
  const token = (id, role) =>
    `Bearer ${generateToken({ id, email: `u${id}@example.com`, role })}`;
  const me = (auth) => request(app).get("/api/v1/auth/me").set("Authorization", auth);

  const student = token(101, "student");
  const admin = token(102, "admin");

  for (let i = 1; i <= ROLE_LIMITS.student; i++) {
    expect((await me(student)).status).toBe(200);
  }
  expect((await me(student)).status).toBe(429);
  // admin คนละ key และโควตาสูงกว่า ยังใช้งานได้
  expect((await me(admin)).status).toBe(200);
}, 20000);
jest.mock("./db");
const pool = require("./db");
const request = require("supertest");
const app = require("./app");
const { generateToken } = require("./auth-helpers");

// ป้องกัน Redis ส่งผลกระทบกับ Test
jest.mock("./cache", () => ({
  redisClient: {
    get: jest.fn(),
    setEx: jest.fn(),
    keys: jest.fn().mockResolvedValue([]),
    del: jest.fn(),
  },
  connectRedis: jest.fn(),
}));

const adminToken = generateToken({
  id: 99,
  email: "admin@example.com",
  role: "admin",
});

describe("Students API (CRUD & Pagination) [ต่อยอดข้อ 1, 2, 3]", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // [แบบฝึกหัดต่อยอดข้อ 2] ทดสอบ Pagination
  test("GET /api/v1/students ควรแสดงผล Pagination และข้อมูลนักศึกษา", async () => {
    // Mock จำนวนรายการทั้งหมด
    pool.query
      .mockResolvedValueOnce([
        [
          { id: 1, name: "Student 1" },
          { id: 2, name: "Student 2" },
        ],
      ]) // สำหรับ baseQuery
      .mockResolvedValueOnce([[{ total: 15 }]]); // สำหรับ countQuery

    const response = await request(app).get("/api/v1/students?page=2&limit=2");

    expect(response.status).toBe(200);
    expect(response.body.pagination.page).toBe(2);
    expect(response.body.pagination.limit).toBe(2);
    expect(response.body.pagination.total).toBe(15);
    expect(response.body.pagination.totalPages).toBe(8); // ceil(15/2)
  });

  // [แบบฝึกหัดต่อยอดข้อ 1] ทดสอบ CRUD
  test("POST /api/v1/students สร้างนักศึกษาสำเร็จ", async () => {
    pool.query.mockResolvedValueOnce([{ insertId: 5 }]);

    const response = await request(app)
      .post("/api/v1/students")
      .send({ name: "New User", major: "IT", email: "new@example.com" });

    expect(response.status).toBe(201);
    expect(response.body.data.id).toBe(5);
  });

  test("DELETE /api/v1/students/:id ลบข้อมูลสำเร็จ (Admin)", async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const response = await request(app)
      .delete("/api/v1/students/1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
  });

  // [แบบฝึกหัดต่อยอดข้อ 3] ทดสอบจำลองฐานข้อมูล Error
  test("GET /api/v1/students/:id จำลอง Error จากฐานข้อมูล (500)", async () => {
    pool.query.mockRejectedValueOnce(new Error("Database Connection Timeout"));

    const response = await request(app).get("/api/v1/students/1");

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
  });
});

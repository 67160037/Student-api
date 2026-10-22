const request = require("supertest");
const app = require("./app");
const pool = require("./db");

const { connectRedis, redisClient } = require("./cache");

beforeAll(async () => {
  await connectRedis();
});

afterAll(async () => {
  await redisClient.quit();
});

afterAll(async () => {
  await pool.end();
});

describe("GET /api/v1/students pagination", () => {
  const major = `PaginationTest${Date.now()}`;

  beforeAll(async () => {
    for (let i = 0; i < 7; i++) {
      await pool.query(
        "INSERT INTO students (name, major, email) VALUES (?, ?, ?)",
        [`นิสิตทดสอบ ${i}`, major, `page${Date.now()}-${i}@example.com`],
      );
    }
  });

  test("ควรคืน page/limit ตรงกับ query และจำนวนรายการไม่เกิน limit", async () => {
    const response = await request(app)
      .get("/api/v1/students")
      .query({ page: 2, limit: 5, major });

    expect(response.status).toBe(200);
    expect(response.body.pagination.page).toBe(2);
    expect(response.body.pagination.limit).toBe(5);
    expect(response.body.data.length).toBeLessThanOrEqual(5);
  });

  test("totalPages ควรคำนวณถูกต้องตามจำนวนรายการทั้งหมด", async () => {
    const response = await request(app)
      .get("/api/v1/students")
      .query({ page: 1, limit: 5, major });

    const { total, limit, totalPages } = response.body.pagination;
    expect(total).toBe(7);
    expect(totalPages).toBe(Math.ceil(total / limit));
  });
});

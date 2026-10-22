jest.mock("./db");
const pool = require("./db");
const request = require("supertest");
const app = require("./app");

describe("GET /api/v1/students/:id (mocked database failure)", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("ควรคืน 500 พร้อมรูปแบบ error มาตรฐานเมื่อฐานข้อมูล error", async () => {
    pool.query.mockRejectedValueOnce(new Error("Connection timeout"));

    const response = await request(app).get("/api/v1/students/1");

    expect(response.status).toBe(500);
    expect(response.body.error).toHaveProperty("code");
    expect(response.body.error).toHaveProperty("message");
  });
});

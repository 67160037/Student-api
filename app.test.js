const request = require("supertest");
const app = require("./app");

describe("GET /", () => {
  test("ควรคืน 200 พร้อมข้อความต้อนรับ", async () => {
    const response = await request(app).get("/");

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Student API พร้อมใช้งาน");
  });
});

describe("route ที่ไม่มีอยู่จริง", () => {
  test("ควรคืน 404 พร้อม ROUTE_NOT_FOUND", async () => {
    const response = await request(app).get("/api/v1/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
  });
});

describe("Error-handling middleware กลาง", () => {
  test("ควรคืน status และ message ตาม err ที่ไม่ใช่ 500 (JSON body ผิดรูปแบบ)", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .set("Content-Type", "application/json")
      .send("{invalid-json");

    expect(response.status).toBe(400);
    expect(response.body.error.code).not.toBe("INTERNAL_SERVER_ERROR");
  });
});

const request = require("supertest");
const app = require("./app");

describe("RBAC middleware", () => {
  test("ควรคืน 403 เมื่อ role ไม่มีสิทธิ์เข้าถึง route", async () => {
    const uniqueEmail = `rbac${Date.now()}@example.com`;

    await request(app)
      .post("/api/v1/auth/register")
      .send({ email: uniqueEmail, password: "Passw0rd!" });

    const loginResponse = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: uniqueEmail, password: "Passw0rd!" });

    const token = loginResponse.body.token;

    const response = await request(app)
      .delete("/api/v1/students/1")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  test("ควรคืน 401 เมื่อ token ผิดรูปแบบ (แก้ไขตัวอักษรบางส่วน)", async () => {
    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer invalid.token.here");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_TOKEN");
  });
});

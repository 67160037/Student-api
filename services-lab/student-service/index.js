// student-service/index.js
const express = require("express");
const app = express();
app.use(express.json());

// ข้อมูลจำลอง แทนการเชื่อมต่อ MySQL จริง เพื่อให้ทดลองได้รวดเร็วในห้องปฏิบัติการ
const students = [
  { id: 1, name: "สมชาย ใจดี", major: "Computer Science" },
  { id: 2, name: "สมหญิง รักเรียน", major: "Information Technology" },
];

app.get("/students", (req, res) => {
  console.log("[student-service] GET /students");
  res.status(200).json({ data: students });
});

app.get("/students/:id", (req, res) => {
  console.log(`[student-service] GET /students/${req.params.id}`);
  const student = students.find((s) => s.id === Number(req.params.id));
  if (!student) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Student not found" },
    });
  }
  res.status(200).json({ data: student });
});

app.listen(4001, () => console.log("Student Service running on port 4001"));

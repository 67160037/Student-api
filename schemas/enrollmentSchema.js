const { z } = require("zod");

// แบบฝึกหัดต่อยอดข้อ 1: cross-field validation
// ถ้า studentStatus เป็น "probation" ลงทะเบียนได้ไม่เกิน 22 หน่วยกิต ไม่เช่นนั้นไม่เกิน 25
const MAX_CREDITS = { probation: 22, normal: 25 };

const enrollmentSchema = z
  .object({
    studentStatus: z.enum(["normal", "probation"]).default("normal"),
    maxCredits: z.number().int().positive().optional(),
  })
  .superRefine((data, ctx) => {
    const limit = MAX_CREDITS[data.studentStatus];
    if (data.maxCredits !== undefined && data.maxCredits > limit) {
      ctx.addIssue({
        code: "custom",
        message:
          data.studentStatus === "probation"
            ? "นักศึกษาสถานะ probation ลงทะเบียนได้ไม่เกิน 22 หน่วยกิต"
            : "ลงทะเบียนได้ไม่เกิน 25 หน่วยกิต",
        path: ["maxCredits"],
      });
    }
  });

module.exports = { enrollmentSchema };
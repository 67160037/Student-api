const express = require("express");
const router = express.Router();
const pool = require("../db");
const { parsePagination, parseSort } = require("../middlewares/query-parser");

// สัปดาห์ที่ 7 ขั้นตอนที่ 3.3: v2 — ปรับโครงสร้าง response ให้ต่างจาก v1
// (คง pagination/sort ไว้ ไม่ปล่อย endpoint ที่คืนทั้งตารางตามข้อควรระวังใน lab)
router.get("/students", parsePagination, parseSort, async (req, res, next) => {
  const { major } = req.query;
  const { page, limit, offset } = req.pagination;
  const { field, order } = req.sort;

  let baseQuery = "SELECT * FROM students";
  let countQuery = "SELECT COUNT(*) AS total FROM students";
  const params = [];
  if (major) {
    baseQuery += " WHERE major = ?";
    countQuery += " WHERE major = ?";
    params.push(major);
  }
  baseQuery += ` ORDER BY ${field} ${order} LIMIT ? OFFSET ?`;

  try {
    const [rows] = await pool.query(baseQuery, [...params, limit, offset]);
    const [[{ total }]] = await pool.query(countQuery, params);

    // v2: ไม่มี wrapper "message" / "data" — ใช้ items + meta
    res.status(200).json({
      items: rows,
      count: rows.length,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

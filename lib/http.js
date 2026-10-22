// แบบฝึกหัดต่อยอดสัปดาห์ที่ 3 ข้อ 2: โครงสร้าง error response มาตรฐานเดียวทั้งระบบ
function sendError(res, statusCode, code, message) {
  return res.status(statusCode).json({ error: { code, message } });
}

module.exports = { sendError };

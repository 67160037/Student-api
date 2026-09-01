// middlewares/query-parser.js
function parsePagination(req, res, next) {
  req.pagination = {
    page: Math.max(1, parseInt(req.query.page) || 1),
    limit: Math.min(100, parseInt(req.query.limit) || 10),
  };
  req.pagination.offset = (req.pagination.page - 1) * req.pagination.limit;
  next();
}

const ALLOWED_SORT_FIELDS = ["id", "name", "major", "created_at"];
function parseSort(req, res, next) {
  req.sort = {
    field: ALLOWED_SORT_FIELDS.includes(req.query.sort) ? req.query.sort : "id",
    order: req.query.order === "desc" ? "DESC" : "ASC",
  };
  next();
}

// แบบฝึกหัดต่อยอดข้อ 3: Middleware ตรวจสอบ Header Deprecation
function deprecationWarning(req, res, next) {
  const currentTimestamp = Math.floor(Date.now() / 1000);
  res.setHeader("Deprecation", `@${currentTimestamp}`);
  res.setHeader("Link", '</api/v2/students>; rel="successor-version"');
  next();
}

module.exports = { parsePagination, parseSort, deprecationWarning };

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A teaching codebase (Thai-language course, "Backend Sandbox" week 1–10 labs) building a Student REST API in Express incrementally. Comments throughout reference which week/exercise introduced each piece (`สัปดาห์ที่ N`, `แบบฝึกหัดต่อยอด...`) — this is intentional lab history, not clutter; preserve the pattern when adding new exercises. `lab-notes.md` and `wk10-lab.md` contain the lab instructions this code was written against.

## Commands

- `npm start` / `npm run dev` — run server (`dev` uses nodemon)
- `npm test` — run Jest test suite
- `npm test -- students.test.js` — run a single test file
- `npm test -- -t "some test name"` — run tests matching a name
- `npm run test:coverage` — Jest with coverage
- `npm run db:setup` — loads `schema.sql` + `seed.sql` into a MySQL container named `mysql_db` (assumes Docker; adjust container name/creds if different locally)

Requires a `.env` (see `.env.example`): DB_*, JWT_SECRET/JWT_EXPIRES_IN, REDIS_URL, ALLOWED_ORIGIN. Server refuses to start if Redis connection fails (see `server.js`).

## Architecture

**Two parallel APIs over different data, sharing nothing:**
- **REST** (`/api/v1/*`, `/api/v2/*`) — backed by MySQL via `db.js` (mysql2/promise pool). This is the actively developed API.
- **GraphQL** (`/graphql`) — backed by an in-memory array in `resolvers.js` (`schema.js` defines the schema). Leftover from week 2; intentionally disconnected from the SQL-backed REST data. Don't assume changes to MySQL tables affect GraphQL responses or vice versa.

**Versioning**: `/api/v1` is the original API, now marked deprecated (see `deprecationNotice` middleware in [middlewares/query-parser.js](middlewares/query-parser.js) — adds `Deprecation`/`Link` headers to every v1 response). `/api/v2` (currently only `/api/v2/students`) reshapes the response envelope (`items`/`count`/`meta` instead of `message`/`data`) but keeps the same pagination/sort/filter semantics. When extending v2, follow the same route file for query logic and just change the response shape — don't duplicate query-building.

**Middleware order matters** in [app.js](app.js): helmet → cors → morgan → json body parser → `requireJson` (rejects non-JSON bodies on POST/PUT/PATCH) → routes. The deprecation header middleware is scoped to `/api/v1` only, applied before the v1 routers mount.

**Auth**: JWT-based (`middlewares/auth.js`): `authenticateToken` populates `req.user` from the bearer token; `authorizeRole(...roles)` gates by `req.user.role`. Passwords hashed with bcrypt in `auth-helpers.js`. Login always calls `verifyPassword` (even for nonexistent users, against a dummy hash) to avoid timing side-channels — preserve this when touching login.

**Object-level authorization**: student records have a nullable `user_id` FK to `users`. `PUT /api/v1/students/:id` checks `req.user.id === student.user_id` (or role `admin`) before allowing edits — this is the "can only edit your own record" pattern from week 6. Note `PATCH /api/v1/students/:id` currently has no such check or auth requirement at all — that's an existing gap, not a pattern to copy elsewhere.

**Caching** ([cache.js](cache.js), Redis): `GET /api/v1/students` and `GET /api/v1/courses` cache full response payloads keyed by all query params (e.g. `students:list:page=..:limit=..:major=..:sort=..:order=..`). Every students mutation (POST/PUT/PATCH/DELETE) calls `invalidateStudentListCache()` which does `KEYS students:list:*` + `DEL` — a full wipe, not surgical invalidation. Courses cache is a single key (`courses:all`) with a longer TTL (5 min vs 60s for students) since courses change less often.

**Transactions**: `routes/enrollments.js` has paired safe/unsafe implementations of the same operation (`POST /students/:id/enrollments` vs `POST /students/:id/enrollments/unsafe`) — the unsafe version deliberately omits the transaction to demonstrate the data-inconsistency risk for teaching purposes. Both exist on purpose; don't "fix" the unsafe one into using a transaction, and don't delete it.

**Standard error shape**: every error response is `{ error: { code, message } }` via `sendError()` in [lib/http.js](lib/http.js). The central error handler in `app.js` (4-arg signature) maps thrown errors to this shape too, masking 500s with a generic message while passing through `err.message` for other status codes. New routes should use `sendError`/`next(err)` rather than ad-hoc JSON error bodies.

**Rate limiting**: `POST /api/v1/students` is limited to 5/min/IP (`lib/middleware.js`). Disabled during tests via `RATE_LIMIT_DISABLED=1` — set this env var when writing new tests that hit that route repeatedly.

**Sort/pagination**: `middlewares/query-parser.js` centralizes pagination (`page`/`limit`/`offset`, capped at 100/page) and sort-field allowlisting (`ALLOWED_SORT_FIELDS`) — this allowlist is what makes it safe to interpolate `field`/`order` directly into SQL `ORDER BY` elsewhere. Add new sortable columns here, not per-route.

## Testing

- Tests live at the repo root (not a `__tests__` dir), one file per concern, named `*.test.js`.
- `jest.setup.js` connects/quits the real Redis client around the whole suite (`connectRedis`) — tests hit real Redis, not a mock, unless the test file explicitly does `jest.mock("./cache")`.
- DB-failure paths are tested via `jest.mock("./db")` + `pool.query.mockRejectedValueOnce(...)` (see `students-mocked.test.js`, `login-mocked.test.js`) — this is the pattern for exercising error-handling branches without a real DB error.
- `npm run test:legacy` runs older standalone `test-results-wk0*.mjs` scripts from earlier weeks — these are not Jest and aren't part of `npm test`.

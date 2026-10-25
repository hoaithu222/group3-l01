/**
 * @file app.ts
 * @description Express application factory.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Middleware registration order (ORDER MATTERS in Express)               │
 * ├───┬─────────────────────────────────────────────────────────────────────┤
 * │ 1 │ trust proxy          — correct IP behind reverse proxy / Docker     │
 * │ 2 │ helmet               — security headers (CSP, HSTS, etc.)           │
 * │ 3 │ cors                 — Cross-Origin Resource Sharing                │
 * │ 4 │ requestIdMiddleware  — attach req.requestId (UUID) for tracing      │
 * │ 5 │ globalLimiter        — IP-based rate limiting (express-rate-limit)  │
 * │ 6 │ compression          — gzip response bodies                         │
 * │ 7 │ morgan               — HTTP access log (piped to winston)           │
 * │ 8 │ json / urlencoded    — parse request bodies                         │
 * │ 9 │ static               — serve uploaded files from disk               │
 * │10 │ swagger              — interactive API docs at /api/docs            │
 * │11 │ routes  (/api)       — all feature routers                          │
 * │12 │ notFoundHandler      — catch unmatched routes → 404 JSON            │
 * │13 │ errorHandler         — global error handler (4-arg, MUST be last)   │
 * └───┴─────────────────────────────────────────────────────────────────────┘
 *
 * Error response format (produced by errorHandler):
 * {
 *   "success":   false,
 *   "error":     { "code": "AUTH_001", "message": "...", "details": [] },
 *   "timestamp": "2026-03-12T10:00:00.000Z",
 *   "requestId": "uuid-v4"
 * }
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import cookieParser from "cookie-parser";
import path from "path";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import { env, getAllowedOrigins } from "./core/config";
import { logger } from "./infrastructure/logger";
import routes from "./router";
import webhooksRoutes from "./modules/webhooks/webhooks.routes";
import internalDocumentsRoutes from "./modules/documents/internal-documents.routes";
import internalWhiteboardsRoutes from "./modules/whiteboards/internal-whiteboards.routes";
import publicPortfolioRoutes from "./modules/portfolio/public-portfolio.routes";
import { httpRequestMetrics, metricsHandler } from "./infrastructure/metrics";
import {
  errorHandler,
  notFoundHandler,
  requestIdMiddleware,
  globalLimiter,
  requestLogger,
  requestContextMiddleware,
  sanitizeInput,
} from "./core/middlewares";

const app = express();

// ── [1] Trust proxy ─────────────────────────────────────────────────────────
// Required when running behind nginx / AWS ALB / Docker so that
// req.ip and req.protocol are set correctly instead of pointing to the proxy.
app.set("trust proxy", 1);

// ── [2] Helmet ───────────────────────────────────────────────────────────────
// Sets security-related HTTP headers (X-Frame-Options, Strict-Transport-Security,
// Content-Security-Policy, etc.).  Must come before CORS so headers stack correctly.
app.use(
  helmet({
    // CSP khai báo tường minh thay vì dựa vào default của helmet.
    //
    // Điều quan trọng nhất ở đây là API domain cũng phục vụ file người dùng
    // upload (/uploads/*). Nếu một file HTML/SVG lọt qua được tầng upload, CSP
    // này là hàng rào cuối: không có 'unsafe-inline' nên script nội tuyến và
    // handler on* trong file đó không chạy được.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        "default-src": ["'none'"],
        "base-uri": ["'none'"],
        "form-action": ["'none'"],
        "frame-ancestors": ["'none'"],
        "img-src": ["'self'", "data:", "blob:"],
        "font-src": ["'self'", "data:"],
        "media-src": ["'self'", "blob:"],
        "connect-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "object-src": ["'none'"],
        "upgrade-insecure-requests": [],
      },
    },
    crossOriginEmbedderPolicy: false,
    // API phục vụ file cho FE ở domain khác → phải cross-origin.
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin" },
    // API không bao giờ cần được nhúng trong iframe.
    frameguard: { action: "deny" },
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    noSniff: true,
    // Không lộ công nghệ backend.
    hidePoweredBy: true,
  })
);

// Express tự set X-Powered-By trước cả helmet trong một số phiên bản.
app.disable("x-powered-by");

// ── [3] CORS ─────────────────────────────────────────────────────────────────
// Allow browsers to send credentials (cookies / Authorization header) only from
// origins listed in ALLOWED_ORIGINS.  X-Request-ID is exposed so clients can
// log it for support tickets.
app.use(
  cors({
    origin: getAllowedOrigins(),
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "X-Request-ID",
      "Idempotency-Key",
      "X-Client-Platform",
      "X-Device-Id",
    ],
    // `Retry-After` + `RateLimit-*` (express-rate-limit `standardHeaders`): trình duyệt (admin web) chỉ đọc được header không thuộc danh sách
    // an toàn của CORS khi được liệt kê ở đây — thiếu thì 429 chỉ hiện "thử lại sau ít phút" thay vì đúng số giây.
    exposedHeaders: [
      "Content-Length",
      "Content-Type",
      "X-Request-ID",
      "Idempotent-Replayed",
      "Retry-After",
      "RateLimit-Limit",
      "RateLimit-Remaining",
      "RateLimit-Reset",
    ],
  })
);

// ── [4] Request ID ───────────────────────────────────────────────────────────
// Assigns a UUID (or echoes the incoming X-Request-ID header) and attaches it
// to `req.requestId`.  All subsequent logs and error responses include this ID
// so a trace can be correlated across services.
app.use(requestIdMiddleware);

// ── Metrics ──────────────────────────────────────────────────────────────────
// `http_request_duration_seconds` cho mọi request; `/metrics` không versioned,
// không qua `authenticateToken` (bảo vệ riêng bằng METRICS_TOKEN — xem
// `metricsHandler`), bỏ qua `globalLimiter` (đã khai báo trong rateLimiter.ts).
app.use(httpRequestMetrics);
if (env.METRICS_ENABLED) {
  app.get("/metrics", (req, res) => {
    metricsHandler(req, res).catch((err: unknown) => {
      logger.error("[metrics] Lỗi khi tạo response /metrics:", err);
      res.status(500).end();
    });
  });
}

// ── [4b] Endpoint NỘI BỘ của collab (p6-01) — TRƯỚC `globalLimiter` và body parser ────────────────────────
// `/api/internal/documents/:id/(access|state)`: chỉ service `collab/` gọi (header `X-Collab-Secret`, không `authenticateToken`). PUT state mang body Yjs NHỊ PHÂN (`express.raw`) nên
// phải chạy trước `express.json()`/`sanitizeInput`; và lưu lượng collab → BE (một PUT mỗi vài giây/tài liệu đang sửa, từ MỘT IP) không được ăn hạn mức IP toàn cục 600 req/phút.
app.use("/api/internal/documents", internalDocumentsRoutes);
// (p6-02) Bảng trắng dùng cùng service collab: `/api/internal/whiteboards/:id/(access|state)` — cùng lý do đặt trước `globalLimiter`/body parser.
app.use("/api/internal/whiteboards", internalWhiteboardsRoutes);

// ── [5] Global rate limiter ──────────────────────────────────────────────────
// Caps overall request throughput per IP before any route logic runs.
// Stricter per-route limiters (authLimiter) are applied in routers.
app.use(globalLimiter);

// ── [6] Compression ──────────────────────────────────────────────────────────
app.use(compression());

// ── [7] Morgan (HTTP access log) ─────────────────────────────────────────────
// Morgan ghi access log dạng "combined" (Apache format) vào file qua Winston.
// requestLogger (bên dưới) ghi structured JSON log chi tiết hơn vào console (dev).
// Production: chỉ dùng Morgan (ghi file). Dev: cả hai hoạt động.
app.use(
  morgan("combined", {
    stream: { write: (msg: string) => logger.info(msg.trim()) },
    // Trong dev, skip Morgan vì requestLogger đã log ra console chi tiết hơn
    skip: () => env.NODE_ENV === "development",
  })
);

// ── [7b] Webhook nhà cung cấp (p0-08) — RAW body, TRƯỚC body parser/sanitize ─────
// Chữ ký (LiveKit JWT ký `sha256(body)`) tính trên đúng chuỗi byte gốc → route webhook tự dùng `express.raw` và phải
// chạy trước `express.json()`/`sanitizeInput` (sau đó body đã bị parse/sửa, chữ ký luôn sai). Không `authenticateToken`.
app.use("/api/v1/webhooks", webhooksRoutes);

// ── [7c] Trang portfolio công khai (p6-07) — NGOÀI `/api`, trước body parser ─────────────────────────────────
// `GET /p/:slug` (HTML tĩnh) và `GET /p/:slug/assets/:file` (ảnh) chỉ đọc nên không cần `express.json()`/`sanitizeInput`; `globalLimiter` ([5]) đã áp. Route tự đặt CSP riêng (đè CSP helmet),
// `X-Content-Type-Options`, `Referrer-Policy`, `X-Robots-Tag`, `Cache-Control` 5 phút cho nginx. Mọi trường hợp không có trang là MỘT trang 404 trung tính. nginx `location /p/` proxy về đây (deploy/).
app.use("/p", publicPortfolioRoutes);

// ── [8] Body parsers ─────────────────────────────────────────────────────────
// Limit request body size to MAX_FILE_SIZE (default 10mb) để tránh DoS.
// (Base này chưa có module thanh toán — nếu thêm webhook Stripe/MoMo sau này,
// nhớ đọc raw body cho route webhook đó TRƯỚC express.json(), vì chữ ký HMAC
// được tính trên đúng chuỗi byte gốc, không phải JSON.stringify(req.body).)
app.use(express.json({ limit: env.MAX_FILE_SIZE }));
app.use(express.urlencoded({ extended: true, limit: env.MAX_FILE_SIZE }));
app.use(cookieParser());

// ── [9] Input Sanitization ───────────────────────────────────────────────────
// Strip HTML tags + trim whitespace từ body/query để chống XSS.
// Phải chạy sau cookieParser/body-parser để có req.body/req.cookies.
app.use(sanitizeInput);

// ── [10] Request Logger ──────────────────────────────────────────────────────
// Detailed request/response logging with duration, requestId, userId.
app.use(requestLogger);

// ── [10b] Ngữ cảnh request (p0-11) ───────────────────────────────────────────
// AsyncLocalStorage { requestId, userId } → logger tự gắn vào mọi dòng log của request. ⚠️ Phải SAU body parser (parser làm đứt ngữ cảnh) và TRƯỚC routes.
app.use(requestContextMiddleware);

// ── [11] Static files ────────────────────────────────────────────────────────
// Serve files stored by LocalStorage at /<UPLOAD_DIR>/<filename>.
//
// Đây là nội dung do người dùng tải lên, phục vụ trên chính origin của API —
// vùng nguy hiểm nhất của toàn hệ thống. Bốn lớp phòng thủ, độc lập nhau:
//
//   1. CSP `default-src 'none'; sandbox` — kể cả khi một file HTML/SVG lọt qua
//      tầng upload, nó không chạy được script, không gọi được API, không đọc
//      được cookie (sandbox không có allow-same-origin).
//   2. `Content-Disposition: attachment` — trình duyệt tải file về thay vì
//      render, nên nội dung không bao giờ trở thành document trên origin này.
//   3. `X-Content-Type-Options: nosniff` — chặn MIME sniffing biến .txt thành HTML.
//   4. `dotfiles: "deny"` + tắt index — không lộ .env, không liệt kê thư mục.
app.use(
  `/${env.UPLOAD_DIR}`,
  express.static(path.resolve(process.cwd(), env.UPLOAD_DIR), {
    index: false,
    dotfiles: "deny",
    setHeaders: (res) => {
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", "attachment");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    },
  })
);

// ── [12] Swagger UI ──────────────────────────────────────────────────────────
// Auto-generated from JSDoc annotations in all module route files.
// Available at /api/docs (browser) and /api/docs.json (raw spec).
//
// MẶC ĐỊNH TẮT TRONG PRODUCTION. Spec liệt kê toàn bộ endpoint, tham số, schema
// và endpoint admin — tức là bản đồ tấn công dựng sẵn, miễn phí, không cần auth.
// Bật lại có chủ đích bằng SWAGGER_ENABLED=true nếu thật sự cần.
if (env.SWAGGER_ENABLED) {
  const swaggerSpec = swaggerJsdoc({
    definition: {
      openapi: "3.0.0",
      info: {
        title: env.APP_NAME,
        version: env.APP_VERSION,
        description: "API documentation",
      },
      servers: [{ url: `/api/v1`, description: "API v1" }],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
      security: [{ BearerAuth: [] }],
    },
    apis:
      env.NODE_ENV === "production"
        ? ["./dist/modules/**/*.js", "./dist/modules/**/*.routes.js"]
        : ["./src/modules/**/*.ts", "./src/modules/**/*.routes.ts"],
  });

  // Swagger UI cần inline script/style — nới CSP CHỈ trên route này, không
  // đụng tới CSP nghiêm ngặt của phần còn lại.
  const swaggerCsp = (
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ): void => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
        "connect-src 'self'; frame-ancestors 'none'; object-src 'none'"
    );
    next();
  };

  app.use("/api/docs", swaggerCsp, swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/api/docs.json", (_req, res) => res.json(swaggerSpec));
}

// ── [13] Feature routes ──────────────────────────────────────────────────────
app.use("/api", routes);

// ── [14] 404 — catch-all for unmatched routes ────────────────────────────────
// Returns { success: false, error: { code: "RES_001", ... } }
app.use(notFoundHandler);

// ── [15] Global error handler ────────────────────────────────────────────────
// MUST be the very last middleware.  Express identifies it by its 4-argument
// signature (err, req, res, next).  All errors thrown via `next(err)` or
// inside `catchAsync` land here and are serialised to the standard JSON format.
app.use(errorHandler);

export default app;

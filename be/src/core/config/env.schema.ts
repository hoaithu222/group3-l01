import { z } from "zod";
import os from "node:os";

const isProduction = process.env.NODE_ENV === "production";

const envSchema = z.object({
  APP_NAME: z.string().default("Super App API"),
  APP_VERSION: z.string().default("1.0.0"),
  PORT: z.coerce.number().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  // Production: ghi log JSON ra stdout (thay vì `logs/*.log`) — Railway/Docker chỉ thu log từ stdout/stderr,
  // và đĩa container là tạm thời. Mặc định tắt để giữ nguyên hành vi docker-compose (file + volume `./logs`).
  LOG_STDOUT: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
  // (p0-11) Định dạng log ở console/stdout: `json` (mặc định production) | `pretty` (mặc định dev). Chuỗi rỗng = chưa đặt.
  LOG_FORMAT: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? v.trim().toLowerCase() : undefined),
    z.enum(["json", "pretty"]).optional()
  ),
  // (p0-11) Ghi đè việc ghi file `logs/*.log`: `false` ≡ `LOG_STDOUT=true` ở production. Không đặt → theo `LOG_STDOUT` (hành vi cũ giữ nguyên).
  LOG_TO_FILE: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? v.trim().toLowerCase() === "true" : undefined),
    z.boolean().optional()
  ),
  // Vai trò tiến trình: api | worker | all (dev mặc định all — worker chạy in-process)
  PROCESS_ROLE: z.enum(["api", "worker", "all"]).default(isProduction ? "api" : "all"),
  // Production: bắt buộc set (dùng để build webhook/link tải công khai) — thiếu thì mọi link dựng từ
  // biến này sẽ trỏ về localhost. Dev/test có default để tiện chạy local.
  PUBLIC_API_URL: isProduction
    ? z.string().url("PUBLIC_API_URL bắt buộc và phải là URL hợp lệ trong production")
    : z.string().url().default("http://localhost:3000"),
  /** Gốc dựng URL lời mời (`/invite/:token`, p1-02 be.md §9) — app đọc chung giá trị này qua deep link. */
  // Production: bắt buộc set — thiếu thì link mời/email nhúng `localhost`, không mở được từ máy người dùng.
  PUBLIC_APP_LINK_BASE: isProduction
    ? z.string().url("PUBLIC_APP_LINK_BASE bắt buộc và phải là URL hợp lệ trong production")
    : z.string().url().default("http://localhost:8081"),
  ALLOWED_ORIGINS: z.string().optional(),
  // Cờ phân hệ: "a=true,b=false" — khoá lạ bị cảnh báo. Mặc định tất cả false.
  FEATURE_FLAGS: z.string().optional(),
  // JWT — production bắt buộc set, dev/test có default để tiện chạy local
  JWT_SECRET: isProduction
    ? z.string().min(32, "JWT_SECRET phải >= 32 ký tự trong production")
    : z.string().min(1).default("dev-only-jwt-secret-change-in-production"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  // Khoá AES-256-GCM (32 byte hex) cho token tích hợp, tài khoản ngân hàng, API key đối tác
  ENCRYPTION_KEY: isProduction
    ? z.string().regex(/^[0-9a-f]{64}$/i, "ENCRYPTION_KEY phải là 32 byte hex")
    : z.string().default("0".repeat(64)),
  // Database — MongoDB Atlas (cloud)
  DATABASE_URL: isProduction
    ? z.string().min(1, "DATABASE_URL bắt buộc trong production")
    : z
        .string()
        .default("mongodb+srv://user:pass@cluster.mongodb.net/mydb?retryWrites=true&w=majority"),
  // Redis
  REDIS_URL: z.string().default("redis://localhost:6379"),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_KEY_PREFIX: z.string().default("superapp:"),
  // JWT Refresh — production bắt buộc set
  JWT_REFRESH_SECRET: isProduction
    ? z.string().min(32, "JWT_REFRESH_SECRET phải >= 32 ký tự trong production")
    : z.string().min(1).default("dev-only-refresh-secret-change-in-production"),
  // Queue (BullMQ)
  QUEUE_PREFIX: z.string().default("superapp"),
  WORKER_CONCURRENCY_DEFAULT: z.coerce.number().int().min(1).default(5),
  WORKER_CONCURRENCY_NOTIFICATIONS: z.coerce.number().int().min(1).default(20),
  WORKER_CONCURRENCY_MEDIA: z.coerce.number().int().min(1).default(2),
  WORKER_CONCURRENCY_CALLS: z.coerce.number().int().min(1).default(10),
  WORKER_CONCURRENCY_PUSH: z.coerce.number().int().min(1).default(10),
  WORKER_SHUTDOWN_GRACE_MS: z.coerce.number().int().min(0).default(30000),
  CRON_TZ: z.string().default("Asia/Ho_Chi_Minh"),
  // Outbox relay (p0-04)
  OUTBOX_RELAY_BATCH: z.coerce.number().int().min(1).max(500).default(50),
  OUTBOX_POLL_MS: z.coerce.number().int().min(200).default(1000),
  // System config / feature flags (p0-07) — TTL cache bộ nhớ tiến trình cho
  // `RuntimeConfigService` + cửa sổ gộp (debounce) broadcast `config:updated`.
  SYSTEM_CONFIG_CACHE_MS: z.coerce.number().int().min(0).default(5000),
  CONFIG_BROADCAST_DEBOUNCE_MS: z.coerce.number().int().min(0).default(2000),
  // Realtime (p0-03) — adapter Socket.IO bắt buộc "redis" ở production
  // (validate-runtime.ts), "memory" chỉ dùng dev/test 1 instance.
  SOCKET_ADAPTER: z.enum(["redis", "memory"]).default("redis"),
  // Định danh instance — gắn vào connection registry (`conn:{userId}`) để biết
  // socket đang ở process nào khi có nhiều instance đứng sau load balancer.
  INSTANCE_ID: z.string().min(1).default(os.hostname()),
  // SMTP / Mail
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  // AWS S3 (optional storage backend)
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  // Endpoint tuỳ chọn (MinIO/staging tương thích S3 — vd http://localhost:9000);
  // để trống dùng endpoint AWS S3 mặc định theo `AWS_REGION`.
  AWS_S3_ENDPOINT: z.string().url().optional(),
  // MinIO/S3-compatible thường cần path-style ("http://host/bucket/key") thay
  // vì virtual-hosted-style ("http://bucket.host/key") mà AWS S3 dùng mặc định.
  AWS_S3_FORCE_PATH_STYLE: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  // Cloudinary (optional storage backend)
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  // Storage
  STORAGE_TYPE: z.enum(["local", "s3", "cloudinary"]).default("local"),
  UPLOAD_DIR: z.string().default("uploads"),
  // 100mb (đổi từ 25mb) — VIDEO (p0-05) cần trần chung lớn hơn; từng kind vẫn
  // bị chặn riêng bởi `LIMITS.upload.kinds[kind].maxBytes`.
  MAX_FILE_SIZE: z.string().default("100mb"),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(10).max(60).default(60),
  ASSET_ORPHAN_TTL_HOURS: z.coerce.number().int().min(1).default(24),
  // Bật presigned PUT (S3) cho client tải thẳng lên storage. false → luôn dùng
  // `API_PUT` (qua `PUT /assets/:id/content`) dù `STORAGE_TYPE=s3` — hữu ích
  // khi bucket chưa cấu hình CORS cho origin app/admin.
  STORAGE_PUBLIC_UPLOAD: z
    .string()
    .transform((v) => v !== "false")
    .default("true"),
  // Thư mục tạm để worker tải nội dung asset về xử lý (thumbnail/duration)
  // trước khi xoá — mặc định thư mục tạm hệ điều hành.
  MEDIA_TMP_DIR: z.string().default(os.tmpdir()),
  // Frontend base URL — dùng để build link trong email (reset password, ...)
  // Production: bắt buộc set — thiếu thì email reset/verify chứa link `localhost` không dùng được.
  FRONTEND_URL: isProduction
    ? z.string().url("FRONTEND_URL bắt buộc và phải là URL hợp lệ trong production")
    : z.string().url().default("http://localhost:5173"),
  // (p2-04) Gốc URL web cho link `/m/<mã họp>` trong email lịch họp — thiếu thì dùng FRONTEND_URL.
  PUBLIC_WEB_BASE_URL: z.string().url().optional(),
  // (p2-04) Địa chỉ ORGANIZER của `.ics` — thiếu thì dùng SMTP_FROM/SMTP_USER.
  MAIL_ICS_ORGANIZER_EMAIL: z.string().email().optional(),
  // Bật Swagger UI (/api/docs). Mặc định TẮT trong production: spec liệt kê
  // toàn bộ endpoint, tham số và schema — bản đồ tấn công miễn phí.
  SWAGGER_ENABLED: z
    .string()
    .transform((v) => v === "true")
    .default(isProduction ? "false" : "true"),
  // Quan sát
  METRICS_ENABLED: z
    .string()
    .transform((v) => v !== "false")
    .default("true"),
  METRICS_TOKEN: z.string().optional(),
  // (p0-11) Sentry — DSN trống/thiếu ⇒ KHÔNG nạp SDK, giữ ConsoleTracker (no-op tuyệt đối). Chuỗi rỗng coi như chưa đặt (compose truyền `${SENTRY_DSN:-}`).
  // DSN sai định dạng không làm sập khởi động: `initSentry()` bắt lỗi và cảnh báo (`validate-runtime` cũng báo).
  SENTRY_DSN: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  // Tên môi trường gửi kèm sự kiện (`staging`/`production`); mặc định = NODE_ENV. Staging chạy NODE_ENV=production nên PHẢI đặt `staging` ở đây
  // — giá trị này cũng quyết định "môi trường production thật" (endpoint dev-tools bị cấm) chứ không riêng NODE_ENV.
  SENTRY_ENVIRONMENT: z.preprocess((v) => (v === "" ? undefined : v), z.string().default(process.env.NODE_ENV ?? "development")),
  /** Mã phát hành (CI đặt = git sha) — khớp release của bản source map trên Sentry. */
  SENTRY_RELEASE: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  // (p0-11) Cổng metrics RIÊNG của worker (`worker:9464/metrics`, Bearer `METRICS_TOKEN`; `/health/live` không cần token). 0 = tắt.
  WORKER_METRICS_PORT: z.coerce.number().int().min(0).max(65535).default(9464),
  // (p0-11) `POST /api/v1/dev/sentry-test` (kiểm kênh báo lỗi, OPS-01): chỉ mount khi bật VÀ không phải môi trường production thật.
  DEV_TOOLS_ENABLED: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
  // (p0-08/p0-11) Job `media.turn-probe` (cron TĨNH, 5 phút): thăm dò TURN — STUN Binding qua UDP + bắt tay TLS. Thiếu `TURN_PROBE_HOST` ⇒ job không làm gì
  // (admin `turn: UNKNOWN`). Ví dụ `turn.superapp.vcijsc.com`.
  TURN_PROBE_HOST: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  TURN_PROBE_TLS_PORT: z.coerce.number().int().min(1).max(65535).default(443),
  TURN_PROBE_UDP_PORT: z.coerce.number().int().min(1).max(65535).default(3478),
  // Push (Firebase Cloud Messaging — D-15) [P4]. Thiếu bất kỳ khoá nào →
  // FirebasePushSender tự chuyển NoopPushSender, log cảnh báo một lần, không
  // chặn khởi động. FIREBASE_CREDENTIALS_JSON (đường dẫn hoặc nội dung JSON
  // service-account) ưu tiên hơn 3 khoá rời nếu có.
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_CREDENTIALS_JSON: z.string().optional(),
  // APNs VoIP (p0-06) — `.p8` Auth Key chung (Apple Developer → Certificates,
  // Identifiers & Profiles → Keys), dùng riêng cho `apns-push-type: voip`.
  // Thiếu bất kỳ khoá nào → ApnsVoipPushSender tự chuyển NoopVoipSender, log
  // cảnh báo một lần, không chặn khởi động (giống FIREBASE_* ở trên).
  APNS_KEY_ID: z.string().optional(),
  APNS_TEAM_ID: z.string().optional(),
  /** Nội dung file `.p8` (escape `\n` thành chuỗi 2 ký tự trong env). */
  APNS_KEY_P8: z.string().optional(),
  /** Đường dẫn file `.p8` trên đĩa — ưu tiên `APNS_KEY_P8` nếu cả hai đều set. */
  APNS_KEY_PATH: z.string().optional(),
  APNS_BUNDLE_ID: z.string().default("com.mancode.vungnui"),
  APNS_USE_SANDBOX: z
    .string()
    .transform((v) => v !== "false")
    .default("true"),
  // (p2-02) Namespace UUID v5 của `callUuid = uuidv5(callId, CALL_UUID_NAMESPACE)` (`apns-id`, CallKit, `CallDto.callUuid`). ⛔ CỐ ĐỊNH vĩnh viễn theo môi trường:
  // đổi giá trị ⇒ mọi `callUuid` đã phát ra không còn khớp `callId` (CallKit coi là cuộc gọi khác). Mặc định GIỮ NGUYÊN giá trị từng hard-code ở
  // `push-payload.builder.ts` (UUID đã phát không đổi) — chỉ khai riêng khi cần tách namespace giữa các môi trường mới.
  CALL_UUID_NAMESPACE: z.string().uuid().default("d2f6a9b0-6e9c-4b6b-9b7a-1f9f6e6a9c1a"),
  // Media SFU (LiveKit) [P4]
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  // (p0-08) URL client kết nối LiveKit (`wss://lk.<domain>`), khác `LIVEKIT_URL` là URL nội bộ BE → LiveKit.
  // Chuỗi rỗng (`LIVEKIT_PUBLIC_URL=` trong .env) coi như chưa đặt.
  LIVEKIT_PUBLIC_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
  // (p0-08) Egress (ghi hình RoomComposite → S3 riêng tư). Thiếu → ghi hình tắt (MEDIA_001 khi gọi startRoomCompositeEgress).
  EGRESS_S3_BUCKET: z.string().optional(),
  EGRESS_S3_REGION: z.string().optional(),
  EGRESS_S3_ACCESS_KEY_ID: z.string().optional(),
  EGRESS_S3_SECRET_ACCESS_KEY: z.string().optional(),
  EGRESS_S3_PREFIX: z.string().default("recordings/"),
  // (p0-08) Endpoint spike token (`POST /dev/media/spike-token`) — mặc định TẮT, chặn cứng ở production (validate-runtime).
  MEDIA_SPIKE_ENABLED: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
  // (p0-08 README §6) Email (phân tách dấu phẩy) được phép xin token spike ngoài người có `system-config:update`.
  MEDIA_SPIKE_ALLOWED_EMAILS: z.string().optional(),
  // Tích hợp bên thứ ba (p5-03) — TẤT CẢ optional: thiếu bộ khoá của provider ⇒ provider `available=false` (cảnh báo lúc khởi động,
  // KHÔNG chặn). GitHub dùng GITHUB APP (không phải OAuth App) nên thay `GITHUB_CLIENT_ID/SECRET` cũ bằng bốn khoá bên dưới.
  /** Id GitHub App (số). */
  GITHUB_APP_ID: z.string().optional(),
  /** PEM khoá riêng của App (ký JWT RS256); chấp nhận `\n` dạng chuỗi 2 ký tự khi đặt trong một dòng env. */
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  /** Slug của App (`https://github.com/apps/<slug>`) — dựng URL cài đặt. */
  GITHUB_APP_SLUG: z.string().optional(),
  /** Client id/secret CỦA GITHUB APP — xác minh người cài đặt thật sự sở hữu `installation_id` (OAuth khi cài đặt), chống nhận nhầm cài đặt của tổ chức khác. */
  GITHUB_APP_CLIENT_ID: z.string().optional(),
  GITHUB_APP_CLIENT_SECRET: z.string().optional(),
  /** Webhook secret của App — xác thực `X-Hub-Signature-256` trên RAW body. */
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  GITLAB_CLIENT_ID: z.string().optional(),
  GITLAB_CLIENT_SECRET: z.string().optional(),
  /** Gốc GitLab (mặc định gitlab.com); do vận hành đặt cho GitLab tự host — KHÔNG bao giờ nhận từ người dùng (chống SSRF). */
  GITLAB_BASE_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().default("https://gitlab.com")),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  FIGMA_CLIENT_ID: z.string().optional(),
  FIGMA_CLIENT_SECRET: z.string().optional(),
  /** Gốc URL công khai của API dùng làm `redirect_uri` OAuth và URL webhook — thiếu thì dùng `PUBLIC_API_URL`. */
  INTEGRATION_OAUTH_REDIRECT_BASE: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
  // Collab (Hocuspocus) — p6-01 be.md §9. `COLLAB_URL` = URL CÔNG KHAI client kết nối (`wss://superapp.vcijsc.com/collab`; http(s) được đổi sang ws(s) khi trả cho client),
  // `COLLAB_INTERNAL_URL` = URL nội bộ BE → collab (`http://collab:4000`: kick/flush/apply/health), `COLLAB_SHARED_SECRET` ≥ 32 ký tự (ký collab token + header
  // `X-Collab-Secret` hai chiều, KHÁC `JWT_SECRET`). Chuỗi rỗng coi như chưa đặt. Cờ `collab` bật mà thiếu bất kỳ khoá nào → lỗi khởi động (`validateRuntime`).
  COLLAB_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
  COLLAB_INTERNAL_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
  COLLAB_SHARED_SECRET: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(32, "COLLAB_SHARED_SECRET phải ≥ 32 ký tự").optional()),
  // Bản đồ / O2O [P5]
  MAPBOX_TOKEN: z.string().optional(),
  // (p6-07) Gốc URL công khai của trang portfolio (`https://superapp.vcijsc.com/p`) — đi kèm slug thành `<base>/<slug>` (link chia sẻ, canonical, 301 slug cũ).
  // BẮT BUỘC khi cờ `career` bật (`validateRuntime`); chuỗi rỗng coi như chưa đặt.
  PUBLIC_PORTFOLIO_BASE_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
  // (p6-07) Tiền tố khoá storage của object build portfolio (`<prefix><portfolioId>/b<n>/index.html`). Object KHÔNG phải `Asset` (sản phẩm dẫn xuất công khai);
  // chỉ chữ/số/`._-/`, không bắt đầu bằng `/`, không `..` (LocalStorage từ chối khoá lạ). Code tự thêm `/` cuối.
  PORTFOLIO_STORAGE_PREFIX: z
    .string()
    .trim()
    .regex(/^(?!\/)(?!.*\.\.)[A-Za-z0-9._/-]+$/, "PORTFOLIO_STORAGE_PREFIX chỉ gồm chữ, số, . _ - / và không chứa .. hoặc bắt đầu bằng /")
    .default("portfolio/"),
  // ⏸ AI — TẠM DỪNG (D-13). Optional, không dùng khi cờ tắt.
  AI_PROVIDER: z.enum(["anthropic", "openai", "gemini"]).default("anthropic"),
  AI_PROFILE: z.enum(["quality", "saving", "free-dev"]).default("quality"),
  AI_MODEL_DEFAULT: z.string().default("claude-opus-5"),
  AI_MODEL_LIGHT: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  EMBEDDINGS_PROVIDER: z.enum(["gemini", "openai"]).default("gemini"),
  EMBEDDINGS_MODEL: z.string().default("gemini-embedding-001"),
  EMBEDDINGS_DIM: z.coerce.number().int().default(768),
  EMBEDDINGS_TIER: z.enum(["free", "paid"]).default("free"),
  EMBEDDINGS_RPM: z.coerce.number().int().optional(),
  EMBEDDINGS_RPD: z.coerce.number().int().optional(),
  EMBEDDINGS_BATCH: z.coerce.number().int().default(100),
  KNOWLEDGE_VECTOR: z.enum(["atlas", "memory"]).default("atlas"),
  AI_MAX_INPUT_TOKENS: z.coerce.number().int().default(120000),
  AI_STT_PROVIDER: z.string().optional(),
  AI_STT_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment variables:", parsed.error.flatten());
    throw new Error("Invalid environment variables");
  }
  return parsed.data;
}

export const env = loadEnv();

/**
 * Whitelist dev mặc định: Expo dev server + web preview + admin Vite dev server. Vite chạy 5173 trước rồi TỰ NHẢY sang 5174, 5175… khi cổng đó đang
 * bị dự án khác chiếm — nếu chỉ liệt kê 5173 thì admin ở cổng khác bị `requireTrustedOrigin` trả 403 ở `POST /auth/refresh` (Vite proxy đặt
 * `changeOrigin` nên `Host` ≠ `Origin`), tức F5 trang nào cũng ĐĂNG XUẤT. Nên liệt kê cả dải cổng Vite, cả `localhost` lẫn `127.0.0.1`.
 * Chỉ dùng khi `ALLOWED_ORIGINS` trống ở môi trường KHÔNG phải production (production bắt buộc khai danh sách).
 */
const DEV_DEFAULT_ORIGINS: string[] = [
  "http://localhost:8081",
  "http://localhost:19006",
  ...["localhost", "127.0.0.1"].flatMap((host) => Array.from({ length: 18 }, (_, i) => `http://${host}:${5173 + i}`)),
];

/**
 * Trả về CORS origin config.
 * - Production + không set ALLOWED_ORIGINS → chặn (throw)
 * - Development + không set → whitelist mặc định (localhost dev servers)
 * - Set "*" → chỉ cho phép ở dev; production sẽ throw
 * - Set danh sách → chỉ cho phép các origin cụ thể
 *
 * Lưu ý: `origin: ["*"]` + `credentials: true` bị browser reject.
 * Phải dùng `true` hoặc callback.
 */
export function getAllowedOrigins(): boolean | string[] {
  if (!env.ALLOWED_ORIGINS) {
    if (isProduction) {
      throw new Error("ALLOWED_ORIGINS is required in production");
    }
    return DEV_DEFAULT_ORIGINS;
  }

  if (env.ALLOWED_ORIGINS === "*") {
    // `origin: true` phản chiếu lại Origin của request. Kết hợp với
    // `credentials: true`, mọi website đều đọc được response đã xác thực của
    // người dùng — tức là bỏ hoàn toàn same-origin policy. Không bao giờ
    // được phép trong production.
    if (isProduction) {
      throw new Error(
        'ALLOWED_ORIGINS="*" không được phép trong production khi CORS bật credentials. ' +
          "Liệt kê cụ thể các origin, ví dụ: https://api.super-app.vn,https://admin.super-app.vn"
      );
    }
    return true;
  }

  const origins = env.ALLOWED_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error("ALLOWED_ORIGINS được set nhưng không chứa origin hợp lệ nào");
  }

  // Production phải là HTTPS tuyệt đối — origin http:// cho phép kẻ tấn công
  // ở tầng mạng chèn trang giả rồi gọi API kèm cookie của người dùng.
  if (isProduction) {
    const insecure = origins.filter((o) => o.startsWith("http://"));
    if (insecure.length > 0) {
      throw new Error(
        `ALLOWED_ORIGINS chứa origin không dùng HTTPS trong production: ${insecure.join(", ")}`
      );
    }
  }

  return origins;
}

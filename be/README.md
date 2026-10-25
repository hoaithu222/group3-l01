# Super App — Backend API

Base Express + TypeScript theo kiến trúc 3 tầng (core / infrastructure / modules).
Phase 0 (nền tảng — RBAC, session rotate thật, queue, assets, audit, notification
lõi) đã hoàn thành; xem `docs/development-roadmap.md` và
`docs/plan/runbook-phase0-be.md` cho chi tiết.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Express 4 + TypeScript strict |
| Database | MongoDB Atlas qua Prisma 5.8 (`datasource provider = "mongodb"`) — chỉ `prisma db push`, KHÔNG dùng `prisma migrate` |
| Cache | Redis |
| Queue | BullMQ (ioredis riêng cho worker/queue, tách khỏi Redis client chính) |
| Storage | Local / AWS S3 / Cloudinary — chọn qua `STORAGE_TYPE` |
| Auth | JWT (access 15m + refresh 7d, rotate thật + reuse detection), blacklist qua Redis |
| Validation | Zod |
| Logging | Winston |
| Mail | Nodemailer (SMTP) |
| Real-time | Socket.IO (Redis adapter cho multi-instance, room guard mặc định đóng) |
| Testing | Jest + Supertest (+ `mongodb-memory-server` khi `TEST_DB=memory`) |
| Container | Docker + docker-compose |

## Cấu trúc

```
src/
├── core/                     # Utilities dùng chung — KHÔNG business logic
│   ├── config/                # env.schema.ts (Zod), validate-runtime.ts (kiểm chéo feature flag ↔ env)
│   ├── constants/              # HttpStatusCode, ROLES, permissions (RBAC), limits, modules (feature flags)
│   ├── exceptions/             # AppError hierarchy (+ VersionConflict/Idempotency/ScopeRateLimit/AccountLocked)
│   ├── middlewares/            # auth (+requirePermission), validate, errorHandler, rateLimiter,
│   │                           # scope-limiter (Redis sliding window), idempotency, upload, sanitize
│   ├── permission/             # Cache trạng thái tài khoản (status/sessionVersion) cho authenticateToken
│   └── utils/                  # catchAsync, ResponseUtils (+cursor), JwtUtils, normalize (tiếng Việt), ...
├── infrastructure/            # Tích hợp bên ngoài
│   ├── database/                # Prisma client singleton (MongoDB Atlas)
│   ├── redis/                   # Redis client singleton
│   ├── queue/                    # BullMQ: queues, worker registry, register-jobs (side-effect import)
│   ├── logger/                  # Winston + createContextLogger
│   ├── mail/                    # Nodemailer + templates
│   ├── storage/                  # IStorage: Local / S3 / Cloudinary
│   ├── socket/                   # Socket.IO server (JWT auth, room guard registerRoomGuard/resolveJoinable)
│   ├── metrics/                   # prom-client: http_request_duration_seconds, socket_connections, queue_*, GET /metrics
│   └── error-tracker/            # Pluggable error tracker (Console mặc định, swap Sentry sau)
├── modules/                   # Module nghiệp vụ — 1 module = 1 thư mục tự chứa
│   ├── auth/                    # Login/refresh (cookie hoặc body)/logout, Session rotate + reuse detection
│   ├── users/                   # CRUD + lock/unlock/change-role/session mgmt (RBAC qua requirePermission)
│   ├── audit-log/                # Flat — ghi vết hành động nhạy cảm, GET /audit-logs (cursor)
│   ├── capabilities/              # Flat — GET /capabilities (feature flags/limits/upload cho client)
│   ├── assets/                    # Upload 2 bước + magic-bytes check + signed URL + cleanup job
│   └── notifications/             # Inbox (cursor) + mark-read + preference + job deliver.recipient
├── shared/                    # DTO/schema dùng chung nhiều module
├── app.ts                     # Express factory, middleware order
├── router.ts                  # /api/health (+ queue) + /api/v1/*
├── server.ts                  # Startup, validate-runtime, connect DB/Redis, worker in-process, graceful shutdown
└── worker.ts                  # Entry riêng cho `PROCESS_ROLE=worker` (scale tách khỏi HTTP)
```

Xem `FOLDER_TREE.md` cho cây thư mục đầy đủ, và `docs/development-roadmap.md` cho định hướng mở rộng theo `d:\work\super-app\docs\notes.md`.

## Chạy

```bash
cp .env.example .env   # điền DATABASE_URL (MongoDB Atlas), JWT_SECRET, ...
npm install
npm run db:push         # đồng bộ schema Prisma → MongoDB (KHÔNG dùng prisma migrate)
npm run dev              # dev với ts-node-dev — PROCESS_ROLE=all chạy worker in-process
# hoặc tách worker riêng (production-like):
npm run dev:worker       # PROCESS_ROLE=worker
# build:
npm run build && npm start
npm run worker           # node dist/worker.js — chỉ cần khi tách api/worker
```

- **Health:** `GET http://localhost:3000/api/health` — trả thêm `services.queue: { waiting, active, failed }`
- **Metrics:** `GET http://localhost:3000/metrics` (không versioned, `Authorization: Bearer METRICS_TOKEN` bắt buộc ngoài localhost) — Prometheus text format
- **Auth:** `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh` (cookie hoặc body — alias cũ `/refresh-token`), `GET /api/v1/auth/me` (alias cũ `/profile`), `POST /api/v1/auth/logout`
- **Users:** `GET/PATCH /api/v1/users/*`, `POST /:id/lock|unlock`, `PATCH /:id/role`, `GET/DELETE /:id/sessions` (cần Bearer token + quyền tương ứng)
- **Audit log:** `GET /api/v1/audit-logs` (quyền `audit-log:view`, cursor pagination)
- **Capabilities:** `GET /api/v1/capabilities` (feature flags + limits hiện hành)
- **Assets:** `POST /api/v1/assets` → `PUT /:id/content` (multipart) → `GET /:id/url` (signed URL 60s)
- **Notifications:** `GET /api/v1/notifications`, `POST /:id/read`, `POST /read-all`, `GET/PUT /api/v1/me/notification-preferences`

## MongoDB (Prisma)

- Prisma Migrate **không hỗ trợ MongoDB** — chỉ dùng `npm run db:push` (áp schema.prisma trực tiếp), `npm run db:push:prod` (bước deploy, `--skip-generate`) và `npm run prisma:reset` (`db push --force-reset`, xoá sạch + áp lại — chỉ dùng ở dev).
- Nếu nâng cấp `prisma`/`@prisma/client`: Prisma ORM **v7 đã bỏ hỗ trợ MongoDB** — chỉ lên tới bản v6.x mới nhất.
- Seed dev: `npm run prisma:seed` (bỏ qua nếu thiếu `SEED_ADMIN_PASSWORD` hoặc `NODE_ENV=production`). Backfill `normalizedName` cho user cũ: `npm run db:backfill-normalized-name`.

## Queue (BullMQ)

- 7 queue: `notifications`, `push`, `media`, `reports`, `gamification`, `integrations`, `cron`.
- `PROCESS_ROLE=all` (mặc định dev): worker chạy in-process cùng HTTP server. `PROCESS_ROLE=api`: chỉ HTTP, không xử lý job. `PROCESS_ROLE=worker`: chỉ job (`node dist/worker.js`).
- Job mới: thêm file trong `modules/<module>/jobs/`, gọi `registerJob(queue, name, fn)`, rồi import trong `infrastructure/queue/register-jobs.ts`.
- Realtime từ job: worker riêng (`worker.ts`) KHÔNG có Socket.IO `Server`. Vẫn dùng `emitToRoom/emitToUsers/emitToScope/emitToAll/leaveRooms/joinRooms` (`infrastructure/socket/socket.emit.ts`) như ở API — worker tự phát qua Redis (`@socket.io/redis-emitter`, cầu nối `socket.bridge.ts`), mọi instance API nhận đúng một lần. Cần `SOCKET_ADAPTER=redis` ở API (bắt buộc ở production); KHÔNG tự `getIO()` trong module.

## Storage

- 3 backend sau `IStorage` interface (`src/infrastructure/storage`): `LocalStorage`, `S3Storage`, `CloudinaryStorage` — chọn bằng env `STORAGE_TYPE=local|s3|cloudinary`.
- Cloudinary: asset upload với `type: "authenticated"`, truy cập bắt buộc qua `storage.getSignedUrl(key)` — không có secure_url public trực tiếp.
- `STORAGE_TYPE=local`: asset private tải qua gateway HMAC `GET /assets/:id/download?exp=&sig=` (không phải `express.static`, tránh phục vụ file private công khai).

## Media (LiveKit, p0-08)

- Mọi thao tác media đi qua cổng `IMediaServer` (`getLiveKit()` ở `@infrastructure/media`); **không** import `livekit-server-sdk` ở module nghiệp vụ. Thiếu `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` → adapter no-op (`MEDIA_001`), không chặn khởi động. Test dùng `InMemoryMediaServer` (không cần LiveKit thật).
- Token: `issueMediaToken()` (TTL `limits.call.tokenTtlSeconds` = 600 s, không bao giờ có `roomAdmin`/`roomCreate`/`roomRecord`); tên phòng qua `roomNames.*` (`call_`/`meet_`/`spike_`).
- **Webhook** `POST /api/v1/webhooks/livekit`: RAW body + `Authorization` JWT của LiveKit, mount ở `app.ts` trước `express.json`; ghi `WebhookEvent` (unique `(provider,eventId)`) rồi mới 2xx; job `livekit.event` (queue `calls`) dispatch theo tiền tố phòng. Cần `npm run db:push` để có unique index `WebhookEvent`.
- Dev (CHƯA XÁC MINH trên máy khác): `livekit-server --dev` (hoặc project LiveKit Cloud) rồi đặt `LIVEKIT_URL=http://localhost:7880`, `LIVEKIT_PUBLIC_URL=ws://localhost:7880`, `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` theo khoá của server, `FEATURE_FLAGS=voice=true` khi cần. Muốn nhận webhook ở dev, khai `webhook.urls` + `api_key` trong file cấu hình LiveKit trỏ tới `{PUBLIC_API_URL}/api/v1/webhooks/livekit`.
- Spike thiết bị: `MEDIA_SPIKE_ENABLED=true` (chỉ dev/staging) mở `POST /api/v1/dev/media/spike-token` (`system-config:update` hoặc email trong `MEDIA_SPIKE_ALLOWED_EMAILS`); `GET /api/v1/admin/media/status` (`system-config:view`) xem cấu hình/kết nối/số phòng.
- Vận hành (self-host, TURN 443/3478, DNS/cert, firewall, ghim phiên bản LiveKit/egress): **chưa làm — bị chặn ngoài** (p0-11 + hạ tầng); xem `docs/plans/phase-0-common/p0-08-media-livekit/`.

## RBAC

- Role hệ thống: `core/constants/roles.ts` — `ROLES.ADMIN`, `ROLES.USER`, `ROLES.MANAGER`.
- Quyền theo role: `core/constants/permissions.ts` (`ROLE_PERMISSIONS`, `permissionsForRole`, `roleHasPermission`).
- Middleware: `requireRoles([...])` (role thô), `requirePermission(key)` (permission key `resource:action`), `requireSelfOrPermission(param, key)` (chính chủ hoặc có quyền).
- Đổi role/khoá tài khoản → tăng `User.sessionVersion` → access token cũ (payload có `sv`) tự vô hiệu ở lần request kế tiếp (không cần đợi hết hạn 15 phút).
- **Lưu ý:** quyền theo dữ liệu (`recruiter:*`, `partner:*` — notes.md phân hệ 5) chưa triển khai, để `[]` trong `AuthUserDto.permissions` ngoài phần theo role.

## Docker

```bash
docker compose -f docker-compose.dev.yml up -d   # dev: hạ tầng (xem file để biết chi tiết hiện có)
docker compose up -d                              # production: redis + api + worker
```

## Mở rộng

- **Module mới:** `npm run gen:module -- <moduleName> [field1:type ...]` hoặc tạo thủ công theo pattern trong `.claude/rules/architecture.md` (pattern Flat cho module đơn giản — xem `audit-log`, `capabilities`).
- **Rules/skills:** xem `CLAUDE.md` và `.claude/rules/` — bắt buộc đọc trước khi code theo `primary-workflow.md`.

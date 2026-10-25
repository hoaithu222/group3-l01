# Development Roadmap — Super App Backend

> Kế hoạch tổng cho cả ba package (thứ tự phân hệ, Phase 0 hạ tầng, hợp đồng
> API với `admin`/`app`) nằm ở `../../docs/development-plan.md`. File này ghi
> đối chiếu nền tảng backend hiện có với 8 phân hệ, và trạng thái Phase 0.

## Trạng thái hiện tại (2026-09) — Phase 0 hoàn thành

Runbook `docs/plan/runbook-phase0-be.md` (B1–B16) đã triển khai đầy đủ trên
nền base Express + TypeScript, Prisma 5.8 + **MongoDB Atlas** (`prisma db
push`, không dùng `prisma migrate`), Redis, Socket.IO, storage pluggable
Local/S3/**Cloudinary**.

**Đã có so với base tối giản trước đó:**

- **RBAC theo role**: `core/constants/permissions.ts` (`ROLE_PERMISSIONS`,
  `PermissionKey = "resource:action"`), middleware `requirePermission`/
  `requireSelfOrPermission`. Vẫn CHƯA phải RBAC data-driven theo
  workspace/channel (xem gap #5 bên dưới — WorkspaceMembership/ChannelGrant
  đã có model khung trong Prisma, chưa có service/route dùng).
- **Auth rotate thật**: `Session` lưu hash refresh token (SHA-256), rotate
  mỗi lần refresh, phát hiện reuse (token cũ dùng lại sau khi đã rotate →
  thu hồi toàn bộ session + `AUTH_010`). `/auth/refresh` nhận cookie (admin
  web) HOẶC body (app mobile); `/auth/me` là tên chính thức, `/profile` là
  alias deprecated.
- **Trạng thái tài khoản**: `User.status` (ACTIVE/LOCKED/PENDING_DELETION/
  ANONYMIZED) + `sessionVersion` — khoá tài khoản hoặc đổi role vô hiệu access
  token cũ trong ≤ 60s (cache Redis) mà không cần đợi hết hạn 15 phút.
- **Queue (BullMQ)**: 7 queue (`notifications`, `push`, `media`, `reports`,
  `gamification`, `integrations`, `cron`), worker chạy in-process
  (`PROCESS_ROLE=all`, mặc định dev) hoặc tách riêng (`PROCESS_ROLE=worker`,
  `src/worker.ts`). `/api/health` báo `services.queue`.
- **Module mới**: `audit-log` (ghi vết hành động nhạy cảm, không chặn nghiệp
  vụ chính khi lỗi), `capabilities` (feature flags/limits cho client),
  `assets` (upload 2 bước + kiểm magic bytes chống giả mạo đuôi file + signed
  URL + job dọn rác 24h), `notifications` (inbox/mark-read/preference lõi —
  chưa có model Message nên chưa test end-to-end fanout thật).
- **Socket.IO**: room guard mặc định ĐÓNG (`registerRoomGuard`/
  `resolveJoinable`) — module tự đăng ký guard theo tiền tố room; bỏ broadcast
  disconnect toàn cục (rò rỉ presence).
- **Chuẩn hoá tiếng Việt**: `core/utils/normalize.ts` (`normalizeSearch`,
  `graphemeLength`) — dùng cho tìm kiếm user không dấu (`User.normalizedName`).
- **Metrics**: `infrastructure/metrics/` (`prom-client`) — `http_request_duration_seconds`,
  `socket_connections`, `queue_jobs_total{queue,status}`, `queue_waiting{queue}`;
  `GET /metrics` (không versioned) yêu cầu `Authorization: Bearer METRICS_TOKEN`
  ngoài localhost.
- **Push infra (Firebase Cloud Messaging — D-15)**: `infrastructure/push/` —
  `IPushSender`/`FirebasePushSender`/`NoopPushSender` + `getPushSender()`
  factory (memoized). Thiếu `FIREBASE_*`/`FIREBASE_CREDENTIALS_JSON` →
  `NoopPushSender` tự động (log cảnh báo một lần, không chặn khởi động, xem
  `validateRuntime()`). Model `DeviceToken` đã có trong `schema.prisma`
  (`userId`, `platform`, `token` unique, `appVersion?`, `lastSeenAt`,
  `revokedAt?`) nhưng **chưa có repository/route** — đăng ký/xoá token
  (`DELETE /me/devices`) và việc gọi `getPushSender()` khi có sự kiện cần
  push thuộc Phase 4 (`communication-hub`).

**Chưa có / để lại cho Phase 1+:**

- Model Workspace/Channel/Message/Thread thật (chỉ có khung
  `WorkspaceMembership`/`ChannelGrant` trong schema, chưa có service/route).
- Thumbnail cho asset ảnh (job `asset.process` bỏ qua vì `sharp` là native
  dependency ngoài phạm vi cài đặt Phase 0 — thêm khi được duyệt).
- ~~`SystemConfig` mới có model, chưa có admin route ghi đè runtime `LIMITS`~~ —
  ✅ 2026-09-17 (p0-07): `/admin/system-config/*` (get/put/reset) +
  `RuntimeConfigService` (`core/config/runtime-config.ts`) ghi đè `LIMITS`/cờ
  phân hệ theo runtime, `GET /capabilities` hợp nhất + ETag/304.
- AI (mọi cờ `ai`/`ai-assistant`/`knowledge`) bị chặn cứng ở
  `validateRuntime()` theo quyết định D-13 — không được bật cho tới khi có
  quyết định mở lại.

## Đối chiếu 8 phân hệ (notes.md) với nền tảng hiện có

| # | Phân hệ | Nền tảng đã có trong base | Cần thiết kế thêm ở tầng cơ sở |
|---|---|---|---|
| 1 | **Communication Hub** (workspace/channel, voice/video, thread, private channel) | Socket.IO room guard (`registerRoomGuard`) sẵn sàng nhận guard theo channel; `notifications` lõi đã có (inbox/preference); enum sự kiện Socket.IO đầy đủ theo hợp đồng Phase 1 (`socket.events.ts`) | Chưa có model Workspace/Channel/Message/Thread thật; chưa có voice/video (WebRTC/SFU riêng); `WorkspaceMembership`/`ChannelGrant` mới là khung schema, chưa có permission service (`requireWorkspaceRole`/`requireChannelAccess`) |
| 2 | **Project Management** (Kanban, AI Auto-Breakdown, Critical Path, Heatmap) | Repository pattern + Zod DTO; queue `reports` sẵn cho job snapshot | Chưa có model Task/Board/Milestone/dependency graph; AI breakdown tạm dừng (D-13) |
| 3 | **Study & Assessment Center** (Resource Hub, Quiz, AI Quiz Generator, Live Quiz Battle) | `assets` module dùng ngay cho Resource Hub (đã có magic-bytes check + signed URL); Socket.IO event `quiz:*` đã định nghĩa sẵn tên | Chưa có model Quiz/Question/Flashcard/Attempt; AI quiz generation tạm dừng (D-13) |
| 4 | **Collaborative Workspace** (Real-time Docs, Whiteboard, Meeting Notes AI) | Socket.IO transport + event `document:updated` đã định nghĩa | Chưa có chiến lược lưu document/CRDT; Meeting Notes cần Speech-to-Text (ngoài phạm vi, AI tạm dừng) |
| 5 | **RBAC** (Custom Roles Engine, Permissions Matrix, Peer-Review rotation) | `ROLE_PERMISSIONS` (system role) + `requirePermission`/`requireSelfOrPermission` là nền tảng Phase 0; model `WorkspaceMembership`/`ChannelGrant` đã có trong Prisma | Chưa có Custom Roles data-driven theo workspace (model `roleRef` đã dự trù trong `ChannelGrant` nhưng chưa có CRUD); quyền theo dữ liệu (`recruiter:*`, `partner:*`) chưa nạp vào `AuthUserDto.permissions` |
| 6 | **Integrity & Resource Management** (Plagiarism Checker, Mentor Connect, Shared Wallet, Cloud Printing) | `audit-log` dùng được ngay cho truy vết giao dịch nhạy cảm | Chưa có model Wallet/Ledger; Plagiarism checker cần AI/scan service riêng |
| 7 | **Gamification** (XP/Level/Badge, Virtual Economy, Burnout Radar, Metaverse) | Queue `gamification` đã có sẵn (chưa có job cụ thể) | Chưa có model XP/Level/Badge/UsageLog; Burnout Radar cần job phân tích định kỳ (`cron` queue đã sẵn, chưa có job) |
| 8 | **Career & Digital Portfolio** | Model `User` (+ `avatarAssetId` liên kết `assets`) là điểm khởi đầu cho ownership | Chưa có model Portfolio/Badge-verification/Recruiter board |

## Khuyến nghị thứ tự (chỉ để tham khảo, chưa quyết định)

RBAC theo workspace/channel (#5, phần còn thiếu) và model Communication Hub
(#1) nên đi cùng nhau — phần lớn phân hệ còn lại (ai được tạo channel, ai
được duyệt bài, ai xem được resource nào) phụ thuộc vào đó. `WorkspaceMembership`/
`ChannelGrant` đã có khung trong Prisma từ Phase 0 để không phải đổi schema
lớn khi bắt tay Phase 1. Tài liệu này không quyết định lộ trình — chỉ ghi lại
điểm phụ thuộc kiến trúc để tránh phải làm lại.

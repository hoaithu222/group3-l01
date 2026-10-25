import { Registry, collectDefaultMetrics, Histogram, Counter, Gauge } from "prom-client";

/**
 * Registry riêng (không dùng global registry mặc định của prom-client) để
 * test/nhiều instance không đụng metric của nhau.
 */
export const registry = new Registry();
collectDefaultMetrics({ register: registry });

/** Thời gian xử lý HTTP request (giây) — gắn bởi `httpRequestMetrics` middleware. */
export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Thời gian xử lý HTTP request tính bằng giây",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [registry],
});

/** Số kết nối Socket.IO đang mở — tăng/giảm trong `socket.server.ts`. */
export const socketConnections = new Gauge({
  name: "socket_connections",
  help: "Số kết nối Socket.IO đang mở",
  registers: [registry],
});

/** Tổng số job BullMQ đã xử lý theo queue/trạng thái — tăng trong `queue/worker.ts`. */
export const queueJobsTotal = new Counter({
  name: "queue_jobs_total",
  help: "Tổng số job đã xử lý, gộp theo queue và trạng thái (completed|failed)",
  labelNames: ["queue", "status"] as const,
  registers: [registry],
});

/** Số job đang chờ theo queue — giá trị được nạp lại mỗi lần `/metrics` được scrape. */
export const queueWaiting = new Gauge({
  name: "queue_waiting",
  help: "Số job đang chờ xử lý theo queue",
  labelNames: ["queue"] as const,
  registers: [registry],
});

/** Tổng số lượt đăng nhập sinh trắc học — tăng trong `BiometricService.login` (p0-13). */
export const authBiometricLoginTotal = new Counter({
  name: "auth_biometric_login_total",
  help: "Tổng số lượt đăng nhập sinh trắc học, gộp theo kết quả (ok|unknown|invalid|expired|locked)",
  labelNames: ["result"] as const,
  registers: [registry],
});

/** Số job đang chờ (delayed) theo queue — nạp lại mỗi lần `/metrics` scrape, giống `queueWaiting`. */
export const queueDelayed = new Gauge({
  name: "queue_delayed",
  help: "Số job đang delay (hẹn giờ) theo queue",
  labelNames: ["queue"] as const,
  registers: [registry],
});

/** Số `OutboxEvent` PENDING/DISPATCHING — nạp lại mỗi lần `/metrics` scrape (p0-04). */
export const outboxPending = new Gauge({
  name: "outbox_pending",
  help: "Số OutboxEvent đang PENDING hoặc DISPATCHING",
  registers: [registry],
});

/** Thời gian từ lúc OutboxEvent được tạo tới lúc DISPATCHED — `.observe()` trong `outbox.relay.ts`. */
export const outboxDispatchDuration = new Histogram({
  name: "outbox_dispatch_duration_seconds",
  help: "Thời gian từ lúc tạo OutboxEvent tới lúc dispatch thành công (giây)",
  buckets: [0.05, 0.1, 0.5, 1, 5, 10, 30, 60, 300],
  registers: [registry],
});

/** Tổng số OutboxEvent chuyển sang FAILED (hết số lần thử) — tăng trong `outbox.relay.ts`. */
export const outboxFailedTotal = new Counter({
  name: "outbox_failed_total",
  help: "Tổng số OutboxEvent chuyển sang trạng thái FAILED",
  registers: [registry],
});

/** Tổng số lần `PermissionService.resolve()` được gọi — tăng trong `core/permission/permission.cache.ts` (p0-02). */
export const permissionResolveTotal = new Counter({
  name: "permission_resolve_total",
  help: "Tổng số lần resolve quyền theo scope, gộp theo scope type và cache hit/miss",
  labelNames: ["type", "cache"] as const,
  registers: [registry],
});

/** Thời gian resolve quyền theo scope (giây) — `.observe()` trong `core/permission/permission.cache.ts`. */
export const permissionResolveDuration = new Histogram({
  name: "permission_resolve_duration_seconds",
  help: "Thời gian resolve quyền theo scope tính bằng giây, gộp theo scope type",
  labelNames: ["type"] as const,
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.3, 1, 2],
  registers: [registry],
});

/** Tổng số lần `bumpVersion()` thất bại do Redis không khả dụng — tăng trong `core/permission/permission.cache.ts`. */
export const permissionBumpFailedTotal = new Counter({
  name: "permission_bump_failed_total",
  help: "Tổng số lần bumpVersion() thất bại do Redis không khả dụng, gộp theo scope type",
  labelNames: ["type"] as const,
  registers: [registry],
});

/** Tổng số sự kiện Socket.IO client→server đã xử lý — tăng trong `handlers/*.handler.ts` (p0-03). */
export const socketEventsTotal = new Counter({
  name: "socket_events_total",
  help: "Tổng số sự kiện Socket.IO client->server, gộp theo tên sự kiện và kết quả (ok|rejected|error)",
  labelNames: ["event", "result"] as const,
  registers: [registry],
});

/** 1 nếu Redis Adapter đang gắn (đa instance), 0 nếu single-instance âm thầm — set trong `socket.server.ts` (p0-03). */
export const socketAdapterUp = new Gauge({
  name: "socket_adapter_up",
  help: "1 nếu Socket.IO Redis Adapter đang hoạt động, 0 nếu chạy chế độ single-instance",
  registers: [registry],
});

/** Tổng số lần phát `presence:updated` — tăng trong `modules/presence/presence.service.ts` (p0-03). */
export const presenceUpdatesTotal = new Counter({
  name: "presence_updates_total",
  help: "Tổng số lần phát sự kiện presence:updated, gộp theo trạng thái mới",
  labelNames: ["state"] as const,
  registers: [registry],
});

// ── p1-07 (read-state-notifications) ─────────────────────────────────────────

/** Thời gian xử lý 1 job `fanout.message` (giây) — quan sát NT-16 (nhóm 200 người ≤ 3 s p95). */
export const notificationFanoutDuration = new Histogram({
  name: "notification_fanout_duration_seconds",
  help: "Thời gian xử lý 1 job fanout.message (giây)",
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5, 10],
  registers: [registry],
});

/** Tổng số push tin nhắn đã thử gửi — `type` (message.new|mention|thread.reply|…), `status` (sent|failed|no-token). */
export const pushSentTotal = new Counter({
  name: "push_sent_total",
  help: "Tổng số push đã thử gửi, gộp theo loại và kết quả",
  labelNames: ["type", "status"] as const,
  registers: [registry],
});

/** Tổng số push bị chặn trước khi gửi — `reason` (muted|mode|dnd|viewing|read|blocked|no-token|revoked|disabled). */
export const pushSuppressedTotal = new Counter({
  name: "push_suppressed_total",
  help: "Tổng số push bị chặn, gộp theo lý do",
  labelNames: ["reason"] as const,
  registers: [registry],
});

// ── p1-09 (discovery — tìm trong kênh/hội thoại) ─────────────────────────────

/** Tổng số lượt tìm trong kênh/hội thoại — `partial=true` khi hết `LIMITS.search.maxTimeMs` (KHÔNG gắn nhãn từ khoá: riêng tư). */
export const searchRequestsTotal = new Counter({
  name: "search_requests_total",
  help: "Tổng số lượt tìm trong kênh/hội thoại, gộp theo loại phạm vi và kết quả một phần",
  labelNames: ["scopeType", "partial"] as const,
  registers: [registry],
});

// ── p0-08 (media LiveKit) ────────────────────────────────────────────────────

/** Webhook LiveKit nhận được — `result`: accepted|duplicate|invalid|error|processed|ignored|failed; `type` chỉ nhận tên sự kiện đã biết (còn lại "other"). */
export const livekitWebhookTotal = new Counter({
  name: "livekit_webhook_total",
  help: "Tổng số webhook LiveKit, gộp theo loại sự kiện và kết quả",
  labelNames: ["type", "result"] as const,
  registers: [registry],
});

/** Thời gian job `livekit.event` xử lý 1 sự kiện (giây) — `.observe()` trong `LiveKitEventProcessor`. */
export const livekitWebhookProcessSeconds = new Histogram({
  name: "livekit_webhook_process_seconds",
  help: "Thời gian xử lý 1 sự kiện webhook LiveKit (giây)",
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

/** Số phòng LiveKit đang mở — cập nhật bởi cron `media.rooms-snapshot` (chỉ khi voice/meeting bật) và `GET /admin/media/status`. */
export const livekitRoomsActive = new Gauge({
  name: "livekit_rooms_active",
  help: "Số phòng media LiveKit đang hoạt động",
  registers: [registry],
});

/** Lỗi gọi API LiveKit (RoomService/Egress) — `op` là tên thao tác của cổng `IMediaServer`, không có dữ liệu người dùng. */
export const livekitApiErrorsTotal = new Counter({
  name: "livekit_api_errors_total",
  help: "Tổng số lỗi khi gọi API LiveKit, gộp theo thao tác",
  labelNames: ["op"] as const,
  registers: [registry],
});

import { registerAdminMediaSinks } from "../events/admin-media.sinks";

/**
 * Side-effect (import từ `register-jobs.ts`, chạy ở worker): đăng ký sink `p2-07.admin-media` vào `meeting.events` (meetings) và `call.signal-dispatch` (calls) để phát
 * `admin:media-updated` cho bảng admin. Module này KHÔNG có processor/cron riêng ở P0 (cron `media.call-daily-stat` là P1). Không cần `worker-registries.ts`: sink chỉ dùng `emitToRoom`
 * (chạy ở worker nhờ cầu nối Redis) + Redis throttle, không phụ thuộc registry quyền/`MessageScope`.
 */
registerAdminMediaSinks();

import { z } from 'zod';

/**
 * Payload push cuộc gọi (`call.incoming|cancelled|answered-elsewhere|missed`) — FCM data-only VÀ body APNs VoIP đều là
 * map CHUỖI PHẲNG (be.md p2-02 §13.2, đã chốt xong phía BE). `callUuid` đã được BE TÍNH SẴN (uuidv5 tất định của
 * `callId`) và có mặt ở MỌI push `call.*` — app đọc thẳng field này, KHÔNG tự tính lại (tránh lệch namespace).
 *
 * `.passthrough()`: payload thật còn vài field app chưa dùng (`reason`, `originDeviceId`, `sentAt`, `callVersion`…) —
 * không khoá cứng để BE thêm field mới không làm `safeParse` của mọi push cũ hơn bỗng dưng lỗi.
 */
export const callPushDataSchema = z
  .object({
    callId: z.string().min(1),
    callUuid: z.string().min(1),
    callerAvatar: z.string().optional(),
    callerId: z.string().min(1),
    /** Rỗng khi người nhận đặt `lockScreenLevel = HIDDEN` (be.md §13.3) — UI native hiện "Super App" thay vì tên thật. */
    callerName: z.string(),
    expiresAt: z.string(),
    mediaKind: z.enum(['AUDIO', 'VIDEO']),
    scopeKind: z.enum(['DIRECT', 'GROUP', 'CHANNEL', 'MEETING']),
    scopeTitle: z.string().optional(),
    targetUserId: z.string().min(1),
    type: z.enum(['call.incoming', 'call.cancelled', 'call.answered-elsewhere', 'call.missed']),
  })
  .passthrough();

export type CallPushData = z.infer<typeof callPushDataSchema>;

/** Parse AN TOÀN từ map chuỗi FCM (`RemoteMessage.data`) / body VoIP — dữ liệu từ bên ngoài, không bao giờ throw. */
export function parseCallPushData(raw: unknown): CallPushData | null {
  const result = callPushDataSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * `targetUserId` khác tài khoản đang đăng nhập (máy đổi chủ, NT-07) ⇒ bỏ hẳn — README p2-02 §2 "Push nhầm tài khoản".
 * `call.incoming` đã hết hạn (`expiresAt` đã qua — "chuông ma") ⇒ cũng bỏ; các loại khác (huỷ/kết thúc/nhỡ) luôn xử lý.
 */
export function shouldHandleCallPush(data: CallPushData, meId: string | null): boolean {
  if (meId === null || data.targetUserId !== meId) return false;
  if (data.type !== 'call.incoming') return true;
  return Date.parse(data.expiresAt) > Date.now();
}

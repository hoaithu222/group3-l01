import type { App } from "firebase-admin/app";
import { getMessaging, type MulticastMessage } from "firebase-admin/messaging";
import { logger } from "../logger";
import type { IPushSender, PushPayload, PushSendResult } from "./push.types";

/** FCM giới hạn tối đa 500 token/lời gọi `sendEachForMulticast`. */
const BATCH_SIZE = 500;

/**
 * Tên LOGIC của kênh (hợp đồng BE, `AndroidChannel`) → id kênh THẬT trên máy.
 *
 * ⛔ Hai thứ này phải tách nhau vì Android **khoá cấu hình kênh đã tạo**: muốn sửa một kênh (ví
 * dụ bản trước lỡ tạo kênh IM LẶNG) thì bắt buộc phải đổi id, mà id lại là thứ BE gửi đi. Ánh xạ
 * ở đúng một chỗ này để lần sau đổi id kênh không phải sờ vào 20 chỗ khai `androidChannel`.
 *
 * ⚠️ Giá trị phải khớp TỪNG KÝ TỰ với `app/src/core/notifications/android-channels.ts`
 * (`ANDROID_CHANNEL_IDS`) và với kênh chuông native `CallPushReceiver.CHANNEL_ID`. Lệch một ký tự
 * thì Android âm thầm đẩy thông báo về kênh mặc định của hệ thống.
 */
const ANDROID_CHANNEL_ID: Record<string, string> = {
  default: "default-v2",
  mentions: "mentions-v2",
  calls: "superapp-call-ring-v1",
};

/** Chỉ hai mã lỗi này coi là token chết — các lỗi khác là lỗi cấu hình server, không xoá oan. */
const DEAD_TOKEN_ERROR_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

/** `call.incoming`/`call.cancelled`/`call.answered-elsewhere` không hiển thị — client tự vẽ UI từ `data`. */
function buildCommonData(payload: PushPayload): Record<string, string> {
  const common: Record<string, string> = {
    type: payload.type,
    targetUserId: payload.targetUserId,
    sentAt: payload.sentAt,
  };
  if (payload.notificationId) common["notificationId"] = payload.notificationId;
  if (payload.scopeType) common["scopeType"] = payload.scopeType;
  if (payload.scopeId) common["scopeId"] = payload.scopeId;
  if (payload.workspaceId) common["workspaceId"] = payload.workspaceId;
  return { ...common, ...payload.data };
}

/** Header APNs của nhánh iOS trong FCM: `apns-collapse-id` (gộp) + `apns-expiration` (epoch giây, khi payload có `expiresAt` hợp lệ — p2-02). `undefined` nếu không có header nào. */
function apnsHeaders(payload: PushPayload): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  if (payload.collapseKey) headers["apns-collapse-id"] = payload.collapseKey;
  const expiresMs = payload.expiresAt ? Date.parse(payload.expiresAt) : NaN;
  if (Number.isFinite(expiresMs)) headers["apns-expiration"] = String(Math.floor(expiresMs / 1000));
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function buildMessage(tokens: string[], payload: PushPayload): MulticastMessage {
  const data = buildCommonData(payload);
  const displayed = !!(payload.title || payload.body);

  const message: MulticastMessage = {
    tokens,
    data,
    android: {
      ...(payload.ttlSeconds && { ttl: payload.ttlSeconds * 1000 }),
      ...(payload.collapseKey && { collapseKey: payload.collapseKey }),
      priority: "high",
      /**
       * ⛔ Khối `android.notification` CHỈ đi kèm push CÓ HIỂN THỊ (`displayed`).
       *
       * Trước 01/10/2026 nó được gắn bất cứ khi nào có `androidChannel`/`groupKey` — kể cả cho
       * `call.incoming`, thứ CỐ Ý là data-only. Mà với FCM, chỉ cần payload mang BẤT KỲ khối
       * notification nào là gói đó thành "notification message": Android tự bày lên khay (ở đây
       * là một thông báo RỖNG, không tiêu đề) và `onMessageReceived` KHÔNG được gọi khi app ở
       * nền ⇒ mọi handler data-only của client im lặng không chạy. Đúng triệu chứng "push tới
       * máy mà app không làm gì".
       *
       * `channelId` cho một gói không hiển thị cũng vô nghĩa: kênh chỉ quyết định cách BÀY một
       * thông báo, mà gói này không bày gì — client tự dựng (Android: `CallPushReceiver` dùng
       * kênh chuông riêng của nó).
       */
      ...(displayed &&
        (payload.androidChannel || payload.groupKey) && {
          notification: {
            ...(payload.androidChannel && {
              channelId: ANDROID_CHANNEL_ID[payload.androidChannel] ?? payload.androidChannel,
            }),
            ...(payload.groupKey && { tag: payload.groupKey }),
          },
        }),
    },
    apns: {
      payload: {
        aps: {
          ...(displayed ? {} : { "content-available": 1 }),
          ...(payload.badge !== undefined && { badge: payload.badge }),
          ...(payload.groupKey && { "thread-id": payload.groupKey }),
          ...(displayed && payload.sound === true && { sound: "default" }),
        },
      },
      ...(apnsHeaders(payload) && { headers: apnsHeaders(payload) }),
    },
  };
  if (displayed) {
    message.notification = { title: payload.title, body: payload.body };
  }
  return message;
}

/**
 * Gửi FCM thật qua `firebase-admin`. Gửi theo lô ≤ {@link BATCH_SIZE} token
 * (`sendEachForMulticast`, không dùng `sendAll` — một nền tảng lỗi không kéo
 * nền tảng khác chết theo). Toàn bộ luồng gửi là non-fatal: lỗi không bao giờ
 * throw ra khỏi hàm, chỉ log và bỏ qua lô đó.
 */
export class FirebasePushSender implements IPushSender {
  constructor(private readonly app: App) {}

  async sendMulticast(tokens: string[], payload: PushPayload): Promise<PushSendResult> {
    if (tokens.length === 0) return { successCount: 0, invalidTokens: [] };
    const messaging = getMessaging(this.app);
    let successCount = 0;
    const invalidTokens: string[] = [];

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);
      try {
        const result = await messaging.sendEachForMulticast(buildMessage(batch, payload));
        result.responses.forEach((r, idx) => {
          if (r.success) {
            successCount += 1;
            return;
          }
          const code = r.error?.code;
          if (code && DEAD_TOKEN_ERROR_CODES.has(code)) {
            invalidTokens.push(batch[idx]);
          } else {
            logger.warn("[push] Gửi FCM lỗi (không xoá token)", { code, message: r.error?.message });
          }
        });
      } catch (err) {
        logger.error("[push] Lỗi gửi lô FCM — bỏ qua lô, không chặn nghiệp vụ", {
          err: (err as Error).message,
        });
      }
    }
    return { successCount, invalidTokens };
  }
}

/** Kênh Android — HIGH cho default/mentions, MAX (ringtone, full-screen intent do p2-02) cho calls. */
export type AndroidChannel = "default" | "mentions" | "calls";

/**
 * Payload chuẩn cho mọi loại push (be.md §6.2) — khoá chung mọi loại: `type`,
 * `targetUserId`, `notificationId?`, `scopeType?`, `scopeId?`, `workspaceId?`,
 * `sentAt`. `data` chỉ chứa khoá RIÊNG của từng loại (`messageId`, `callId`, …)
 * — `push-payload.builder.ts` là nơi DUY NHẤT ghép khoá chung + riêng, sender
 * không tự suy luận field nào thuộc chung/riêng.
 */
export interface PushPayload {
  type: string;
  targetUserId: string;
  notificationId?: string;
  scopeType?: string;
  scopeId?: string;
  workspaceId?: string;
  /** ISO — lúc payload được build (không phải lúc gửi thật, có thể lệch vài giây do gộp burst). */
  sentAt: string;
  /** Thiếu cả `title` lẫn `body` → data-only (không kèm `notification`, dùng cho tín hiệu cuộc gọi để client tự vẽ UI kể cả khi app ở nền). */
  title?: string;
  body?: string;
  /** Khoá riêng của loại — `messageId`, `callId`, `meetingId`, … (đã ép string). */
  data: Record<string, string>;
  ttlSeconds?: number;
  /**
   * Hạn dùng TUYỆT ĐỐI (ISO) — nhánh APNs của FCM đặt `apns-expiration` = epoch giây của giá trị này (p2-02: chuông `call.incoming` không nằm lại hàng đợi APNs
   * quá hạn đổ chuông). Thiếu → KHÔNG đặt header (giữ mặc định của FCM như trước). Chỉ builder đặt, cho loại thật sự cần.
   */
  expiresAt?: string;
  /** Android `collapseKey` / iOS `apns-collapse-id` — gộp thông báo cùng khoá thành 1 trên khay. */
  collapseKey?: string;
  androidChannel?: AndroidChannel;
  /** Badge số — chỉ iOS dùng (`aps.badge`), Android bỏ qua. */
  badge?: number;
  /**
   * Nhóm thông báo theo luồng (p1-07 §2 "Payload") — Android `notification.tag` (thay thế thông báo cũ
   * cùng tag) + iOS `aps.thread-id` (gom nhóm trên màn hình khoá). Thiếu → không đặt.
   */
  groupKey?: string;
  /** `true` → iOS `aps.sound="default"`; `false`/thiếu → im lặng (Android âm do kênh quyết định). Chỉ áp cho push có hiển thị. */
  sound?: boolean;
}

export interface PushSendResult {
  successCount: number;
  /** Token chết (`registration-token-not-registered`/`invalid-registration-token`) — caller tự xoá/khoá `DeviceToken`. */
  invalidTokens: string[];
}

/**
 * Provider-agnostic — mặc định `FirebasePushSender`, fallback `NoopPushSender`
 * khi thiếu credentials (xem `getPushSender()` trong `push.factory.ts`).
 */
export interface IPushSender {
  sendMulticast(tokens: string[], payload: PushPayload): Promise<PushSendResult>;
}

/** Môi trường APNs — mỗi `DeviceToken` APNS_VOIP ghi rõ môi trường lúc đăng ký. */
export type ApnsEnvironment = "SANDBOX" | "PRODUCTION";

/**
 * Body phẳng gửi APNs VoIP (be.md §5.6/§6.2 `call.incoming`) — KHÔNG bọc
 * `aps`, mọi khoá đều ở top-level JSON. `callUuid` = UUID v5 tất định từ
 * `callId` (dùng làm `apns-id` và để CallKit dùng cùng UUID, p2-02).
 */
export interface VoipPayload {
  type: "call.incoming";
  targetUserId: string;
  callId: string;
  callUuid: string;
  mediaKind: string;
  callerId: string;
  callerName?: string;
  callerAvatar?: string;
  scopeTitle?: string;
  scopeType?: string;
  scopeId?: string;
  workspaceId?: string;
  /** (p2-02) `version` của `Call` lúc phát tín hiệu (chuỗi số) — app bỏ tín hiệu cũ hơn cái đã xử lý. */
  callVersion?: string;
  /** (p2-02) Hạn đổ chuông (ISO, `startedAt + ringTimeoutSeconds`) — `apns-expiration` = `min(now + 60 s, expiresAt)`. */
  expiresAt?: string;
  /** (p2-02) `DIRECT` | `GROUP` | `CHANNEL` | `MEETING` — CallKit vẽ cuộc gọi 1-1 khác nhóm. */
  scopeKind?: string;
  /** (p2-02) Thiết bị gây ra sự kiện (nếu có) — thiết bị đó bỏ qua tín hiệu. */
  originDeviceId?: string;
  sentAt: string;
}

export interface VoipSendResult {
  ok: boolean;
  /** Mã trạng thái HTTP/2 APNs (0 nếu chưa gửi được — vd lỗi kết nối). */
  status: number;
  /** 410 hoặc 400 `BadDeviceToken`/`DeviceTokenNotForTopic` → caller revoke `DeviceToken`. */
  shouldRevoke: boolean;
  /** 429/5xx → caller nên để BullMQ retry job thay vì coi là thất bại chung cuộc. */
  retriable: boolean;
  reason?: string;
}

/** Provider-agnostic cho VoIP — mặc định `ApnsVoipPushSender`, fallback `NoopVoipSender` khi thiếu APNS_*. */
export interface IVoipSender {
  send(token: string, environment: ApnsEnvironment, bundleId: string, payload: VoipPayload): Promise<VoipSendResult>;
}

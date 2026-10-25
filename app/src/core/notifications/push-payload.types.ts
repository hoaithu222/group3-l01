/**
 * Hợp đồng payload push (p0-06 `be.md` §6.2) — phần CLIENT đọc.
 *
 * ⚠️ Viết tay theo bảng §6.2 và `infrastructure/push/push.types.ts` của BE, KHÔNG
 * phải sinh từ `contracts/push-types.json` (p0-09 chưa có). Khi p0-09 có thì thay
 * file này bằng bản sinh — mọi nơi dùng chỉ đọc qua `PushPayload`/`parsePushPayload`,
 * nên đổi nguồn không phải sửa chỗ khác.
 *
 * FCM `data` là map CHUỖI: mọi giá trị ở đây đều là `string` (số/bool đã bị BE ép
 * chuỗi — `count`, `minutesBefore`, `version`…). Đọc số thì `Number(...)` tại chỗ dùng.
 */
import type { Notification } from 'expo-notifications';

/**
 * Loại push của Phase 0 + Phase 1 (`be.md` §6.2) và các loại BE đã đăng ký thêm (p1-07 `be.md` §15.4: `task.*`,
 * `mention.role`). Loại lạ (Phase 4+) vẫn parse được — `type` là `string`.
 */
export const PUSH_TYPES = [
  'message.new',
  'mention',
  'mention.role',
  'thread.reply',
  'task.assigned',
  'task.comment',
  'task.comment-mention',
  'task.due-soon',
  'call.incoming',
  'call.cancelled',
  'call.answered-elsewhere',
  'call.missed',
  'meeting.invited',
  'meeting.reminder',
  'meeting.started',
  'meeting.updated',
  'meeting.cancelled',
  'meeting.recap-published',
  'announcement.required',
  'announcement.reminder',
] as const;
export type PushType = (typeof PUSH_TYPES)[number];

/**
 * Khoá DATA mà client đọc. Chỉ khoá trong danh sách này được giữ lại khi parse —
 * payload không đáng tin (bất kỳ ai gửi được FCM cho app này đều điền được `data`),
 * nên không chuyển tiếp khoá lạ tới router.
 */
const PUSH_DATA_KEYS = [
  'notificationId',
  'scopeType',
  'scopeId',
  'workspaceId',
  'sentAt',
  'messageId',
  'threadId',
  /** id TIN GỐC của luồng — `thread.reply`/`mention` trong luồng (p1-07 §15.4). `threadId` cùng giá trị, KHÔNG phải `Thread.id`. */
  'rootMessageId',
  'channelId',
  'boardId',
  'taskId',
  'commentId',
  'conversationKind',
  'count',
  'callId',
  'callUuid',
  'callerId',
  'meetingId',
  /** `meeting.reminder` + `kind = "RECAP"` = nhắc chủ trì viết biên bản (p2-06: `dataKeys: ["meetingId", "kind"]` ở BE). */
  'kind',
  'recapId',
  /** id lượt thi thử — `study.mock-auto-submitted` (p4-02: `dataKeys: ["attemptId", "setId"]` ở BE). */
  'attemptId',
  /** id lượt xuất báo cáo đóng góp — `contribution.export-ready|failed` (p4-06: `dataKeys: ["exportId", "boardId", "workspaceId"]` ở BE). */
  'exportId',
  /** `mentor.*` (p6-03: `dataKeys: ["workspaceId", "postId", "applicationId", "engagementId", "conversationId"]` ở BE). */
  'postId',
  'applicationId',
  'engagementId',
  'conversationId',
  /** `job-offer.received|message` (p6-08: `dataKeys: ["offerId"]` / `["offerId", "companyId"]` ở BE) — chỉ id, không tiêu đề/nội dung lời mời (CR-47). */
  'offerId',
  /** `print-order.*` (p6-05: `dataKeys: ["orderId", "code"]` ở BE) — chỉ id + mã đơn, KHÔNG PIN/tên tệp/số tiền. */
  'orderId',
  /** `message.reminder` (p7-04: `dataKeys: ["reminderId", "messageId", "scopeType", "scopeId", "unavailable"]` ở BE) — chỉ id; `unavailable` là chuỗi `"true"` khi tin đã gỡ/mất quyền. */
  'reminderId',
  'unavailable',
  /** `scheduled-message.failed` (p7-04: `dataKeys: ["scheduledMessageId"]` ở BE) — KHÔNG nội dung tin. */
  'scheduledMessageId',
  /** `roadmap.lesson-due-reminder` (p4-07 bước 12, P1: `dataKeys: ["lessonId", "subjectId"]` ở BE) — mở thẳng buổi học đến hạn. */
  'lessonId',
  'subjectId',
  /** `document.collaborator-added` (p6-01: `dataKeys: ["workspaceId", "documentId"]` ở BE) — mở thẳng tài liệu vừa được mời. */
  'documentId',
] as const;
type PushDataKey = (typeof PUSH_DATA_KEYS)[number];

/**
 * Payload đã kiểm. `type` + `targetUserId` LUÔN có (BE bảo đảm mọi payload có `targetUserId`
 * — máy vừa đổi tài khoản thì app bỏ push của người cũ, NT-07); khoá còn lại tuỳ loại.
 */
export type PushPayload = Partial<Record<PushDataKey, string>> & {
  targetUserId: string;
  type: string;
};

/**
 * Loại KHÔNG hiển thị (data-only): app tự vẽ UI từ `data` — việc của p2-02 (CallKit / màn gọi đến).
 * p0-06 chỉ bảo đảm handler foreground KHÔNG bật banner cho chúng.
 */
const DATA_ONLY_TYPES: ReadonlySet<string> = new Set([
  'call.incoming',
  'call.cancelled',
  'call.answered-elsewhere',
]);

/** Push tin nhắn — chỉ nhóm này bị ẩn khi người dùng đang xem đúng scope (xem `foreground-policy.ts`). */
const SCOPE_SUPPRESSIBLE_TYPES: ReadonlySet<string> = new Set(['message.new', 'mention']);

export function isDataOnlyPushType(type: string): boolean {
  return DATA_ONLY_TYPES.has(type);
}

export function isScopeSuppressiblePushType(type: string): boolean {
  return SCOPE_SUPPRESSIBLE_TYPES.has(type);
}

/**
 * Bóc payload từ `data` của notification. `null` khi thiếu `type` hoặc `targetUserId` —
 * không phải push của BE này (vd thử từ console Firebase), hoặc payload hỏng.
 *
 * ⚠️ Nhận `unknown` chứ không phải `Record<string, unknown>`: `content.data` của
 * expo-notifications có thể là `undefined` (push không có data) hoặc — ở vài đường
 * native — chuỗi JSON thay vì object; parse hết ở một chỗ để nơi gọi khỏi tự lo.
 */
export function parsePushPayload(raw: unknown): PushPayload | null {
  const data = toRecord(raw);
  if (!data) return null;

  const type = readString(data.type);
  const targetUserId = readString(data.targetUserId);
  if (!type || !targetUserId) return null;

  const payload: PushPayload = { targetUserId, type };
  for (const key of PUSH_DATA_KEYS) {
    const value = readString(data[key]);
    if (value) payload[key] = value;
  }
  return payload;
}

/**
 * Lấy phần `data` từ một notification của expo. Ưu tiên `content.data`; rơi về
 * `trigger.remoteMessage.data` / `trigger.payload` khi `content.data` không mang payload của BE
 * (vài đường native của FCM/APNs đặt khoá tuỳ ý ở chỗ khác — chưa kiểm trên máy thật).
 */
export function extractPushData(notification: Notification): unknown {
  const direct: unknown = notification.request.content.data;
  if (parsePushPayload(direct)) return direct;

  const trigger = notification.request.trigger;
  if (trigger && 'type' in trigger && trigger.type === 'push') {
    return trigger.remoteMessage?.data ?? trigger.payload ?? direct;
  }
  return direct;
}

function toRecord(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

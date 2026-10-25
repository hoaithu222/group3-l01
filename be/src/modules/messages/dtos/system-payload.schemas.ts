import { z } from "zod";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

/**
 * Payload theo `systemType` (be.md §3, §5.7) — `SystemMessageService.post()`
 * validate bằng union này trước khi ghi `Message.systemPayload`. Module gọi
 * (p1-05 hội thoại, p2-01 gọi thoại, p2-04 họp, p1-03/này pin, p5-03 tích
 * hợp) chịu trách nhiệm đưa đúng field — service KHÔNG suy luận thêm.
 */
export const systemPayloadSchemas = {
  CONVERSATION_CREATED: z.object({ actorId: objectIdSchema }),
  MEMBER_JOINED: z.object({ userId: objectIdSchema }),
  MEMBER_LEFT: z.object({ userId: objectIdSchema }),
  MEMBER_ADDED: z.object({ actorId: objectIdSchema, userIds: z.array(objectIdSchema).min(1) }),
  MEMBER_REMOVED: z.object({ actorId: objectIdSchema, userIds: z.array(objectIdSchema).min(1) }),
  ROLE_CHANGED: z.object({
    actorId: objectIdSchema,
    userId: objectIdSchema,
    from: z.string(),
    to: z.string(),
  }),
  OWNER_TRANSFERRED: z.object({ actorId: objectIdSchema, fromUserId: objectIdSchema, toUserId: objectIdSchema }),
  TITLE_CHANGED: z.object({ actorId: objectIdSchema, from: z.string().nullable(), to: z.string() }),
  AVATAR_CHANGED: z.object({ actorId: objectIdSchema }),
  MESSAGE_PINNED: z.object({ actorId: objectIdSchema, messageId: objectIdSchema }),
  CALL_SUMMARY: z.object({
    callId: objectIdSchema,
    mediaKind: z.enum(["AUDIO", "VIDEO"]),
    status: z.enum(["COMPLETED", "MISSED", "DECLINED", "NO_ANSWER", "BUSY", "CANCELLED"]),
    durationSec: z.number().int().min(0),
    initiatorId: objectIdSchema,
    participantIds: z.array(objectIdSchema),
  }),
  MEETING_REMINDER: z.object({
    meetingId: objectIdSchema,
    title: z.string(),
    startAt: z.coerce.date(),
    minutesBefore: z.number().int().min(0),
  }),
  /**
   * `startedAt` = lúc PHIÊN họp này bắt đầu (thẻ chat "Cuộc họp đã bắt đầu · <giờ>" — tin cũ chưa có thì app dùng `createdAt` của tin). `endedAt`/`durationSec` (p2-06)
   * do server điền khi cuộc họp kết thúc (sửa tại chỗ thẻ "đã bắt đầu"); vắng = đang diễn ra.
   */
  MEETING_STARTED: z.object({
    meetingId: objectIdSchema,
    title: z.string(),
    startedAt: z.coerce.date().optional(),
    endedAt: z.coerce.date().optional(),
    durationSec: z.number().int().min(0).optional(),
  }),
  /** `attachmentCount`/`publishedVersion` (p2-06) tuỳ chọn để tin cũ (chỉ 4 trường) vẫn hợp lệ. */
  MEETING_RECAP: z.object({
    meetingId: objectIdSchema,
    recapId: objectIdSchema,
    title: z.string(),
    excerpt: z.string(),
    attachmentCount: z.number().int().min(0).optional(),
    publishedVersion: z.number().int().min(1).optional(),
  }),
  MEETING_RECORDING_READY: z.object({ meetingId: objectIdSchema, recordingId: objectIdSchema, durationSec: z.number().int().min(0).optional() }),
  /**
   * (p5-03) Tin từ tích hợp GitHub/GitLab/Figma. `source`/`summary` là hai trường cũ của p1-04 (bắt buộc — tin cũ vẫn hợp lệ); phần còn lại TUỲ CHỌN để app vẽ khối
   * riêng (icon nhà cung cấp, tiêu đề, tối đa 5 commit, nút "Mở trên …"). Chuỗi do người ngoài nhập nên đã cắt độ dài ở mapper; `url` CHỈ https (app còn tự kiểm domain).
   */
  INTEGRATION: z.object({
    source: z.string().max(40),
    summary: z.string().max(400),
    provider: z.enum(["GITHUB", "GITLAB", "FIGMA"]).optional(),
    event: z.string().max(40).optional(),
    action: z.string().max(40).optional(),
    title: z.string().max(300).optional(),
    url: z.string().max(2000).url().refine((u) => u.startsWith("https://"), "Chỉ nhận liên kết https").optional(),
    actor: z.object({ login: z.string().max(80), avatarUrl: z.string().max(2000).url().optional() }).optional(),
    repo: z.string().max(200).optional(),
    ref: z.string().max(200).optional(),
    number: z.number().int().min(0).optional(),
    commits: z.array(z.object({ sha7: z.string().max(12), message: z.string().max(200) })).max(10).optional(),
    commitCount: z.number().int().min(0).optional(),
    integrationId: objectIdSchema.optional(),
  }),
  /** p1-05 be.md §5.5/§11 — `actorId=null` khi giải tán bởi nền tảng (kiểm duyệt), `byPlatform` phân biệt UI hiển thị. */
  CONVERSATION_DISSOLVED: z.object({ actorId: objectIdSchema.nullable(), byPlatform: z.boolean() }),
  /** p6-04 §2 "Nhắc nợ" — TUYỆT ĐỐI không có số tiền/tên người nợ: chỉ đếm + nơi mở ví. */
  WALLET_REMINDER: z.object({ workspaceId: objectIdSchema, debtorsCount: z.number().int().min(1) }),
  /** p6-03 be.md §5 — cố vấn tham gia nhóm chat; `endsAt` ISO 8601 (hạn đợt cố vấn). KHÔNG mang nội dung đơn ứng tuyển. */
  MENTOR_JOINED: z.object({ mentorId: objectIdSchema, endsAt: z.string().datetime() }),
  /** p6-03 be.md §5 — cố vấn rời nhóm chat khi đợt kết thúc: `EXPIRED` hết hạn · `LEFT` cố vấn tự rời · `REMOVED` bị/được kết thúc bởi quản trị/nền tảng/thu hồi quyền. */
  MENTOR_LEFT: z.object({ mentorId: objectIdSchema, reason: z.enum(["EXPIRED", "LEFT", "REMOVED"]) }),
} as const;

export type SystemPayloadMap = { [K in keyof typeof systemPayloadSchemas]: z.infer<(typeof systemPayloadSchemas)[K]> };
export type SystemMessageTypeWithPayload = keyof typeof systemPayloadSchemas;

/**
 * Validate `payload` theo đúng `systemType` — dùng bởi `SystemMessageService.post()`.
 * Không dùng `z.discriminatedUnion` (build động từ `Object.entries` không giữ
 * literal type tốt) — tra bảng trực tiếp đơn giản và an toàn kiểu hơn.
 */
export function parseSystemPayload<T extends SystemMessageTypeWithPayload>(
  systemType: T,
  payload: unknown
): SystemPayloadMap[T] {
  const schema = systemPayloadSchemas[systemType];
  return schema.parse(payload) as SystemPayloadMap[T];
}

/**
 * Khoá loại thông báo + `kind` hợp nhất của Phase 3 (p3-03, p3-04). Chuỗi `type` theo quy ước hiện có
 * của `registerNotificationType` (chữ thường, dấu chấm — vd `workspace.invite-accepted`); tên kế hoạch
 * (`TASK_ASSIGNED`, `JOIN_REQUESTED`…) là khoá hằng ở đây, KHÔNG phải chuỗi trên dây.
 *
 * Module sở hữu đăng ký loại của mình bằng `registerNotificationType()` (side-effect lúc import) với
 * `type` lấy từ đây. Mẫu push tiếng Việt tương ứng đã có sẵn ở
 * `modules/notifications/services/push-templates.vi.ts` (foundation Phase 3) — KHÔNG cần sửa file đó.
 */
export const PHASE3_NOTIFICATION_TYPES = {
  /** p3-03 — người được giao thẻ. */
  TASK_ASSIGNED: "task.assigned",
  /** p3-03 — bình luận mới (người làm + người tạo, trừ tác giả). */
  TASK_COMMENT: "task.comment",
  /** p3-03 — được nhắc tên trong bình luận (hợp nhất ưu tiên hơn TASK_COMMENT). */
  TASK_COMMENT_MENTION: "task.comment-mention",
  /** p3-03 — nhắc hạn trước `LIMITS.task.dueReminderHoursBefore` giờ. */
  TASK_DUE_SOON: "task.due-soon",
  /** p3-04 — lời mời đích danh (nếu email đã có tài khoản đã xác minh). */
  WORKSPACE_INVITED: "workspace.invited",
  /** p3-04 — có yêu cầu tham gia chờ duyệt (gửi OWNER/ADMIN, gộp theo workspace 10 phút). */
  JOIN_REQUESTED: "workspace.join-requested",
  JOIN_APPROVED: "workspace.join-approved",
  JOIN_REJECTED: "workspace.join-rejected",
  /** OWNER/ADMIN THÊM THẲNG người dùng vào nhóm (tra bằng email/SĐT) — chỉ hộp thư, không push. */
  MEMBER_ADDED: "workspace.member-added",
  /** p3-04 — khách sắp hết hạn (`LIMITS.guest.expiringNoticeHours`), gửi khách + người mời. */
  GUEST_EXPIRING: "guest.expiring",
  /** p3-04 (P1) — `@role` trong kênh. */
  MENTION_ROLE: "mention.role",
  /** p3-04 — ĐÃ đăng ký ở p1-03 (`channel.service.ts`); dùng lại, KHÔNG đăng ký lần nữa. */
  PRIVATE_ADDED: "channel.private-added",
} as const;
export type Phase3NotificationType = (typeof PHASE3_NOTIFICATION_TYPES)[keyof typeof PHASE3_NOTIFICATION_TYPES];

/**
 * `NotificationRecipient.kind` mới — thứ tự ưu tiên hợp nhất nằm ở `modules/notifications/services/notify.ts`
 * (`KIND_PRIORITY`, foundation Phase 3 đã thêm): MENTION 100 > TASK_COMMENT_MENTION 100 (khác `dedupeKey` nguồn nên
 * không đụng nhau) > MENTION_ROLE 90 > … > TASK_COMMENT 10.
 */
export const PHASE3_NOTIFICATION_KINDS = {
  TASK_COMMENT_MENTION: "TASK_COMMENT_MENTION",
  TASK_COMMENT: "TASK_COMMENT",
  MENTION_ROLE: "MENTION_ROLE",
} as const;

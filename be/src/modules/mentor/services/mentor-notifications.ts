import { registerNotificationType, type NotificationTypeDef } from "../../notifications/public";

/**
 * Loại thông báo Mentor Connect (README §5) — tên theo quy ước chấm-gạch của mã (`wallet.expense-added`…), map với tên kế hoạch:
 * `MENTOR_APPLICATION` → `mentor.application`, `MENTOR_ACCEPTED` → `mentor.accepted`, `MENTOR_REJECTED` → `mentor.rejected`,
 * `MENTOR_ENDING_SOON` → `mentor.ending-soon`, `MENTOR_ENDED` → `mentor.ended`.
 *
 * Người nhận là OWNER/ADMIN nhóm → `scope WORKSPACE` (kiểm `workspace.read` lúc giao). Người nhận là CỐ VẤN/người ứng tuyển (có thể
 * không còn/chưa là thành viên) → `scope null` (không kiểm quyền phạm vi) + `workspaceId` để app mở đúng chỗ. `refs` chỉ chứa id.
 */
export const MENTOR_NOTIFICATION_TYPES = {
  APPLICATION: "mentor.application",
  ACCEPTED: "mentor.accepted",
  REJECTED: "mentor.rejected",
  ENDING_SOON: "mentor.ending-soon",
  ENDED: "mentor.ended",
  /** Quản trị nền tảng ẩn bài (admin.md §2.1) — báo người đăng. */
  POST_HIDDEN: "mentor.post-hidden",
} as const;

const TITLES: Record<string, { title: string; body: string }> = {
  [MENTOR_NOTIFICATION_TYPES.APPLICATION]: { title: "Đơn ứng tuyển cố vấn mới", body: "Có người muốn làm cố vấn cho nhóm của bạn" },
  [MENTOR_NOTIFICATION_TYPES.ACCEPTED]: { title: "Đã chấp nhận cố vấn", body: "Đơn cố vấn đã được chấp nhận" },
  [MENTOR_NOTIFICATION_TYPES.REJECTED]: { title: "Đơn cố vấn chưa phù hợp", body: "Nhóm đã phản hồi đơn ứng tuyển của bạn" },
  [MENTOR_NOTIFICATION_TYPES.ENDING_SOON]: { title: "Đợt cố vấn sắp kết thúc", body: "Đợt cố vấn sẽ kết thúc trong vài ngày tới" },
  [MENTOR_NOTIFICATION_TYPES.ENDED]: { title: "Đợt cố vấn đã kết thúc", body: "Quyền cố vấn trong nhóm đã được thu hồi" },
  [MENTOR_NOTIFICATION_TYPES.POST_HIDDEN]: { title: "Bài tìm cố vấn đã bị ẩn", body: "Quản trị viên đã ẩn một bài tìm cố vấn của nhóm" },
};

const BASE: Omit<NotificationTypeDef, "type" | "pushType" | "priority"> = {
  inbox: true,
  inboxFilter: "all",
  androidChannel: "default",
  respectMute: "ALWAYS",
  bypassDnd: false,
  batchable: false,
  readAction: "workspace.read",
  personal: true,
};

/** Idempotent (registry `Map.set`) — gọi ở CẢ API (`registerMentorModule()`) lẫn worker (`jobs/mentor.jobs.ts`). */
export function registerMentorNotificationTypes(): void {
  for (const type of Object.values(MENTOR_NOTIFICATION_TYPES)) {
    registerNotificationType({
      ...BASE,
      type,
      pushType: type,
      priority: type === MENTOR_NOTIFICATION_TYPES.APPLICATION ? 2 : 1,
      push: {
        dataKeys: ["workspaceId", "postId", "applicationId", "engagementId", "conversationId"],
        collapseKey: (refs) => `${type}:${String(refs.engagementId ?? refs.applicationId ?? refs.postId ?? "")}`,
        template: () => TITLES[type],
      },
    });
  }
}

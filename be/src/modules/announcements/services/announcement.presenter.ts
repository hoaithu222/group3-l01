import type { AnnouncementRequest, AnnouncementView } from "../entities/announcement.interface";

export interface ViewContext {
  now: Date;
  confirmedByMe: boolean;
  /** Người yêu cầu / quản trị kênh — thấy số đã xác nhận và mở danh sách. */
  canViewReceipts: boolean;
}

/** DTO trạng thái yêu cầu theo góc nhìn người xem — số liệu chỉ cho người có quyền xem danh sách xác nhận. */
export function toAnnouncementView(request: AnnouncementRequest, ctx: ViewContext): AnnouncementView {
  return {
    messageId: request.messageId,
    channelId: request.channelId,
    requestedBy: request.requestedBy,
    createdAt: request.createdAt,
    deadlineAt: request.deadlineAt,
    expired: request.deadlineAt !== null && request.deadlineAt <= ctx.now,
    confirmedByMe: ctx.confirmedByMe,
    canViewReceipts: ctx.canViewReceipts,
    ...(ctx.canViewReceipts && { confirmedCount: request.confirmedCount }),
  };
}

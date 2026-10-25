/**
 * Entity của module `announcements` (p5-04) — yêu cầu xác nhận đã đọc một tin trong kênh chỉ quản trị được đăng (ADMINS_ONLY).
 * Khai ĐỘC LẬP với Prisma; `receipt` CHỈ tạo khi người nhận chủ động bấm "Đã đọc" — không suy từ mốc đọc (RC-02).
 */

export interface AnnouncementRequest {
  id: string;
  messageId: string;
  channelId: string;
  workspaceId: string;
  requestedBy: string;
  deadlineAt: Date | null;
  confirmedCount: number;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  createdAt: Date;
}

export interface AnnouncementReceipt {
  id: string;
  requestId: string;
  userId: string;
  confirmedAt: Date;
}

/** Tin gốc mà yêu cầu gắn vào — chỉ các trường cần để kiểm điều kiện. */
export interface AnnouncementMessage {
  id: string;
  scopeType: "CHANNEL" | "CONVERSATION";
  scopeId: string;
  workspaceId: string | null;
  threadId: string | null;
  kind: "USER" | "SYSTEM" | "POLL";
  authorId: string | null;
  deletedAt: Date | null;
}

export interface AnnouncementChannel {
  id: string;
  workspaceId: string;
  postingPolicy: "MEMBERS" | "ADMINS_ONLY";
  status: "ACTIVE" | "ARCHIVED";
}

/** Trạng thái yêu cầu theo góc nhìn người xem (`GET /channels/:id/announcements`, `GET /messages/:id/announcement`). */
export interface AnnouncementView {
  messageId: string;
  channelId: string;
  requestedBy: string;
  createdAt: Date;
  deadlineAt: Date | null;
  /** Quá `deadlineAt` (chưa huỷ) — không xác nhận được nữa nhưng vẫn hiện "Đã hết hạn". */
  expired: boolean;
  confirmedByMe: boolean;
  /** Người yêu cầu / quản trị kênh mới thấy số liệu và mở danh sách xác nhận. */
  canViewReceipts: boolean;
  confirmedCount?: number;
}

export interface ReceiptItem {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  /** Chỉ có ở danh sách "đã xác nhận". */
  confirmedAt?: Date;
}

export interface ReceiptsPage {
  data: ReceiptItem[];
  meta: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
    /** Số người ĐANG đọc được kênh (trừ người yêu cầu) đã xác nhận / cần xác nhận — tính lúc đọc. */
    confirmedCount: number;
    audienceCount: number;
  };
}

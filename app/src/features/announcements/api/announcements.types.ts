/**
 * Hợp đồng BE `announcements` (p5-04 be.md §5–6) — yêu cầu xác nhận đã đọc một tin trong kênh chỉ quản trị được đăng
 * (`postingPolicy = ADMINS_ONLY`). Ngày là chuỗi ISO (BE trả JSON).
 */

/** Trạng thái yêu cầu theo GÓC NHÌN NGƯỜI XEM — `GET /channels/:id/announcements` (mỗi tin một dòng, đã bỏ yêu cầu bị huỷ). */
export interface AnnouncementView {
  messageId: string;
  channelId: string;
  requestedBy: string;
  createdAt: string;
  /** `null` = không hạn. */
  deadlineAt: string | null;
  /** Quá `deadlineAt` (chưa huỷ) — không xác nhận được nữa nhưng vẫn hiện "Đã hết hạn". */
  expired: boolean;
  confirmedByMe: boolean;
  /** Người yêu cầu / quản trị kênh: thấy số đã xác nhận và mở được danh sách. */
  canViewReceipts: boolean;
  /** Chỉ có khi `canViewReceipts`. ⚠️ View KHÔNG có tổng người cần xác nhận — "N/M" chỉ có ở `ReceiptsMeta.audienceCount`. */
  confirmedCount?: number;
}

export type ReceiptStatus = 'confirmed' | 'pending';

export interface ReceiptItem {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  /** Chỉ có ở danh sách "đã xác nhận". */
  confirmedAt?: string;
}

/**
 * `confirmedCount`/`audienceCount` là trường mở rộng của meta cursor: số người ĐANG đọc được kênh (trừ người yêu cầu) đã
 * xác nhận / cần xác nhận — tính lúc đọc, nên GIỐNG NHAU ở mọi trang và cả hai tab.
 */
export interface ReceiptsMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
  confirmedCount: number;
  audienceCount: number;
}

export interface ReceiptsPage {
  data: ReceiptItem[];
  meta: ReceiptsMeta;
}

export interface ConfirmResult {
  confirmedAt: string;
}

export interface CreateAnnouncementInput {
  messageId: string;
  /** ISO, tương lai, tối đa 30 ngày (BE kiểm); vắng = không hạn. */
  deadlineAt?: string;
}

/**
 * `announcement:updated` — HAI dạng cùng tên sự kiện:
 *  · `ch:{id}` (tạo/khôi phục/huỷ): `{ required, deadlineAt, cancelled }` — KHÔNG kèm view đầy đủ (mỗi người có `confirmedByMe` riêng);
 *  · `user:{id}` (đa thiết bị của người vừa xác nhận): `{ required: true, confirmedByMe: true }`.
 */
export interface AnnouncementUpdatedPayload {
  messageId: string;
  channelId: string;
  required: boolean;
  deadlineAt?: string | null;
  cancelled?: boolean;
  confirmedByMe?: boolean;
}

/** `announcement:confirmed` (tới `user:{người yêu cầu}`): có người vừa bấm "Tôi đã đọc". */
export interface AnnouncementConfirmedPayload {
  messageId: string;
  channelId: string;
  confirmedCount: number;
}

/**
 * Kiểu lời mời phía HR (p6-08) — khớp `CompanyOfferItem`/`CompanyOfferDetail`/`OfferMessageView` ở `be/src/modules/recruiter/services/recruiter.presenter.ts`.
 * `sharedEmail` CHỈ có khi sinh viên đã chọn "Chia sẻ email" lúc Quan tâm — mọi nơi khác của cổng KHÔNG có email ứng viên.
 */
import type { DeclineReason, EmploymentType, OfferStatus } from '@/features/recruiter';

export interface OfferStudent {
  userId: string;
  /** Đã ẩn danh hoá → "Tài khoản đã xoá". */
  displayName: string;
  /** URL ký sẵn, dùng thẳng làm `src` (không cần Bearer) — như `TalentCard.avatarUrl`. */
  avatarUrl: string | null;
}

export interface OfferItem {
  id: string;
  student: OfferStudent;
  recruiter: { userId: string; name: string };
  title: string;
  employmentType: EmploymentType;
  status: OfferStatus;
  declineReason: DeclineReason | null;
  /** Đã tính cả tạm ngưng doanh nghiệp (BE `effectiveThreadLocked`). */
  threadLocked: boolean;
  sentAt: string;
  readAt: string | null;
  respondedAt: string | null;
  expiresAt: string;
  /** Số tin mới chưa đọc phía doanh nghiệp. */
  unreadMessages: number;
}

export interface OfferDetail extends OfferItem {
  message: string;
  location: string | null;
  /** URL ký 60 s — chỉ dùng để mở/tải ngay, không lưu. */
  jdUrl: string | null;
  sharedEmail: string | null;
  /** Trao đổi được khi INTERESTED + chưa khoá + doanh nghiệp còn được duyệt. */
  threadOpen: boolean;
}

export interface OfferMessage {
  id: string;
  side: 'COMPANY' | 'CANDIDATE';
  content: string;
  createdAt: string;
}

/** Bộ lọc danh sách lời mời (`companyOffersQuerySchema`); khoảng ngày lọc phía client trên các trang đã tải (BE chưa có tham số ngày). */
export interface OfferListParams {
  status?: OfferStatus;
  recruiterId?: string;
  limit?: number;
}

/** `POST /companies/:id/offers` (`sendOfferSchema`, `.strict()`). Trường tuỳ chọn để TRỐNG thì KHÔNG gửi. */
export interface SendOfferPayload {
  companyId: string;
  studentId: string;
  title: string;
  message: string;
  employmentType: EmploymentType;
  location?: string;
  jdAssetId?: string;
  /** `Idempotency-Key` (8–128 ký tự) — sinh bằng `useIdempotencyKey`. */
  idempotencyKey: string;
}

export interface SendMessagePayload {
  offerId: string;
  content: string;
  /** Id chống gửi trùng (8–64 ký tự) — BE idempotent theo `(người gửi, clientMessageId)`. */
  clientMessageId: string;
}

/** `details` của `429 RECR_005` — hạn mức tháng đã hết. */
export interface QuotaExceededDetails {
  period: string;
  used: number;
  quota: number;
}

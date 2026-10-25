/**
 * Kiểu DÙNG CHUNG của hai nửa p6-08 (vận hành `recruiter` và cổng HR `recruiter-portal`) — viết tay theo BE thật
 * (`be/src/modules/recruiter/services/recruiter.presenter.ts`, `entities/recruiter.interface.ts`). Ngày giờ đi qua JSON là chuỗi ISO.
 *
 * Nằm ở `recruiter` (nửa vận hành) và xuất qua `@/features/recruiter` để cổng HR dùng lại — cùng cách `user` dùng barrel của `skill`.
 * Đổi DTO ở BE thì đối chiếu lại file này và `recruiter.types.ts`.
 */
export type CompanyStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export type CompanyTier = 'FREE' | 'PRO' | 'ENTERPRISE';
export type CompanySize = 'S1_10' | 'S11_50' | 'S51_200' | 'S201_1000' | 'S1000_PLUS';
export type MemberRole = 'OWNER' | 'RECRUITER';

export type OfferStatus = 'SENT' | 'READ' | 'INTERESTED' | 'DECLINED' | 'WITHDRAWN' | 'EXPIRED';
export type EmploymentType = 'INTERNSHIP' | 'FULL_TIME' | 'PART_TIME' | 'FREELANCE';
export type DeclineReason = 'NOT_LOOKING' | 'NOT_A_FIT' | 'LOCATION' | 'TIMING' | 'OTHER';

/** `CompanyView` của BE — `statusReason` chỉ thành viên công ty và vận hành thấy. */
export interface CompanyView {
  id: string;
  name: string;
  website: string;
  taxCode: string | null;
  description: string | null;
  /** URL ký (hết hạn ngắn) — chỉ dùng làm `src` ảnh, không lưu. */
  logoUrl: string | null;
  industry: string | null;
  sizeRange: CompanySize | null;
  tier: CompanyTier;
  status: CompanyStatus;
  /** Lý do duyệt/từ chối/tạm ngưng gần nhất. */
  statusReason: string | null;
  /** CAS `expectedVersion` cho `PATCH`. */
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** `MemberView` — `email` là của NHÂN SỰ công ty (không phải ứng viên). */
export interface CompanyMemberView {
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  joinedAt: string;
}

/** `UsageView` của `GET /companies/:id/usage` (và trong `GET /companies/:id`). */
export interface CompanyUsage {
  /** `YYYY-MM` theo Asia/Ho_Chi_Minh. */
  period: string;
  used: number;
  quota: number;
  remaining: number;
  tier: CompanyTier;
}

import type { EmploymentType, JobOffer, JobOfferStatus, OfferDeclineReason, OfferMessageSide } from "../entities/recruiter.interface";
import type { TxHandle } from "./tx";

export interface JobOfferCreateInput {
  id: string;
  companyId: string;
  recruiterId: string;
  studentId: string;
  title: string;
  message: string;
  employmentType: EmploymentType;
  location: string | null;
  jdAssetId: string | null;
  activeKey: string;
  clientRequestId: string;
  sentAt: Date;
  expiresAt: Date;
}

/** Trường ghi khi chuyển trạng thái (chỉ khoá có mặt mới ghi); `version` do repository tăng. */
export interface JobOfferPatch {
  status?: JobOfferStatus;
  readAt?: Date;
  respondedAt?: Date;
  withdrawnAt?: Date;
  sharedEmail?: string | null;
  declineReason?: OfferDeclineReason;
  threadLocked?: boolean;
  activeKey?: string;
}

export interface OfferListFilter {
  status?: JobOfferStatus;
  recruiterId?: string;
  /** Cursor `(sentAt, id)` giảm dần. */
  before?: { at: Date; id: string };
  /** Số dòng đọc (đã cộng 1 để biết còn trang sau). */
  take: number;
}

export interface MonthlyOfferStats {
  period: string;
  sent: number;
  read: number;
  interested: number;
  declined: number;
  expired: number;
}

export interface IJobOfferRepository {
  findById(id: string, tx?: TxHandle): Promise<JobOffer | null>;
  findByRequest(recruiterId: string, clientRequestId: string, tx?: TxHandle): Promise<JobOffer | null>;
  /** P2002: `activeKey` (đã có lời mời mở) hoặc `[recruiterId, clientRequestId]` → `UniqueViolationError` (`key` chứa tên chỉ mục). */
  create(input: JobOfferCreateInput, tx?: TxHandle): Promise<JobOffer>;
  /** CAS theo trạng thái nguồn: `null` khi lời mời không còn ở một trong `from` (đã có người chuyển). Tăng `version`. */
  transition(id: string, from: readonly JobOfferStatus[], patch: JobOfferPatch, tx?: TxHandle): Promise<JobOffer | null>;
  listForStudent(studentId: string, f: OfferListFilter): Promise<JobOffer[]>;
  listForCompany(companyId: string, f: OfferListFilter): Promise<JobOffer[]>;
  /** Lời mời còn mở (SENT|READ|INTERESTED) — đích socket khi công ty đổi trạng thái/bị chặn/ẩn danh hoá. */
  openByCompany(companyId: string, limit: number): Promise<JobOffer[]>;
  openByStudent(studentId: string, limit?: number): Promise<JobOffer[]>;
  openByStudentCompany(studentId: string, companyId: string): Promise<JobOffer[]>;
  /** Sinh viên đã từng nhận lời mời (bất kỳ trạng thái) từ công ty này — điều kiện báo cáo công ty. */
  hasOfferBetween(studentId: string, companyId: string): Promise<boolean>;
  /** SENT|READ đã quá `expiresAt`. */
  findDue(now: Date, limit: number): Promise<JobOffer[]>;
  /** Khoá thread một lời mời mở (tăng `version`); `null` khi không còn mở/đã khoá. */
  lockThread(id: string, tx?: TxHandle): Promise<JobOffer | null>;
  /** Đóng khoá `activeKey` + khoá thread khi sinh viên bị ẩn danh hoá (giữ trạng thái). */
  detachStudent(id: string, tx?: TxHandle): Promise<boolean>;
  addUnread(id: string, side: OfferMessageSide, lastMessageAt: Date, tx?: TxHandle): Promise<void>;
  clearUnread(id: string, side: OfferMessageSide): Promise<void>;
  /** Đếm lời mời theo trạng thái của một công ty (chi tiết vận hành — không nội dung). */
  countByStatus(companyId: string): Promise<Record<JobOfferStatus, number>>;
  setReportedCount(id: string, count: number): Promise<void>;
  statsByMonth(from: Date, to: Date, tz: string): Promise<MonthlyOfferStats[]>;
  topCompanies(from: Date, to: Date, limit: number): Promise<Array<{ companyId: string; sent: number }>>;
}

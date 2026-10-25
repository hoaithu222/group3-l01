import type { Company, CompanySize, CompanyStatus, CompanyTier } from "../entities/recruiter.interface";
import type { TxHandle } from "./tx";

export interface CompanyCreateInput {
  id: string;
  name: string;
  normalizedName: string;
  nameKey: string;
  taxCode: string | null;
  taxCodeKey: string;
  website: string;
  emailDomain: string | null;
  description: string | null;
  logoAssetId: string | null;
  industry: string | null;
  sizeRange: CompanySize | null;
  createdBy: string;
}

/** Trường được sửa (chỉ khoá có mặt mới ghi); `version` do repository tăng khi CAS thành công. */
export interface CompanyPatch {
  name?: string;
  normalizedName?: string;
  nameKey?: string;
  taxCode?: string | null;
  taxCodeKey?: string;
  website?: string;
  emailDomain?: string | null;
  description?: string | null;
  logoAssetId?: string | null;
  industry?: string | null;
  sizeRange?: CompanySize | null;
  tier?: CompanyTier;
  offerQuotaOverride?: number | null;
  status?: CompanyStatus;
  statusReason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
}

export interface CompanyListFilter {
  q?: string;
  status?: CompanyStatus;
  tier?: CompanyTier;
  page: number;
  limit: number;
}

export interface ICompanyRepository {
  findById(id: string, tx?: TxHandle): Promise<Company | null>;
  findMany(ids: readonly string[]): Promise<Map<string, Company>>;
  /** Công ty (chưa REJECTED — REJECTED đã nhả khoá) đang giữ `nameKey` HOẶC `taxCodeKey`, bỏ qua `exceptId`. Đường nhanh cho `RECR_004`; unique index là chốt đua ghi. */
  findByKeys(nameKey: string, taxCodeKey: string, exceptId?: string, tx?: TxHandle): Promise<Company | null>;
  /** P2002 (trùng `nameKey`/`taxCodeKey`) → `UniqueViolationError`. */
  create(input: CompanyCreateInput, tx?: TxHandle): Promise<Company>;
  /**
   * CAS theo `version` (+ tuỳ chọn `fromStatuses`): trả bản MỚI sau khi cập nhật, `null` khi không khớp (đã có người sửa/đổi trạng thái).
   * P2002 (đổi khoá tên/MST) → `UniqueViolationError`.
   */
  update(id: string, expectedVersion: number, patch: CompanyPatch, opts?: { fromStatuses?: readonly CompanyStatus[] }, tx?: TxHandle): Promise<Company | null>;
  /** Ghi `updatedAt` (không đổi `version`) — ÉP hai transaction cùng đụng công ty xung đột ghi (Mongo) để chạy tuần tự (vd hai OWNER gỡ nhau cùng lúc). */
  touch(id: string, tx?: TxHandle): Promise<void>;
  list(filter: CompanyListFilter): Promise<{ data: Company[]; total: number }>;
  /** Đặt TUYỆT ĐỐI (idempotent) số báo cáo đang mở. */
  setReportedCount(id: string, count: number): Promise<void>;
  countByStatus(): Promise<Record<CompanyStatus, number>>;
}

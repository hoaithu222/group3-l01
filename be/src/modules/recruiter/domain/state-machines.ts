import type { CompanyMemberRole, CompanyStatus, JobOfferStatus } from "../entities/recruiter.interface";
import { OPEN_OFFER_STATUSES } from "../entities/recruiter.interface";

/**
 * Máy trạng thái THUẦN của recruiter (không I/O) — service chỉ nối với repository (CAS theo trạng thái nguồn).
 * Bảng chuyển hợp lệ theo be.md §5: công ty PENDING→APPROVED|REJECTED, APPROVED→SUSPENDED, SUSPENDED→APPROVED, REJECTED→(resubmit)PENDING;
 * lời mời SENT→READ, SENT|READ→INTERESTED, mọi trạng thái mở→DECLINED|WITHDRAWN, SENT|READ→EXPIRED.
 */
export type CompanyAction = "approve" | "reject" | "suspend" | "reinstate" | "resubmit";

const COMPANY_TRANSITIONS: Record<CompanyAction, { from: readonly CompanyStatus[]; to: CompanyStatus }> = {
  approve: { from: ["PENDING"], to: "APPROVED" },
  reject: { from: ["PENDING"], to: "REJECTED" },
  suspend: { from: ["APPROVED"], to: "SUSPENDED" },
  reinstate: { from: ["SUSPENDED"], to: "APPROVED" },
  resubmit: { from: ["REJECTED"], to: "PENDING" },
};

/** Trạng thái sau `action`, hoặc `null` khi không hợp lệ ở `current` (→ `RECR_009`). */
export function nextCompanyStatus(current: CompanyStatus, action: CompanyAction): CompanyStatus | null {
  const t = COMPANY_TRANSITIONS[action];
  return t.from.includes(current) ? t.to : null;
}

export const companyFromStatuses = (action: CompanyAction): readonly CompanyStatus[] => COMPANY_TRANSITIONS[action].from;

export type OfferAction = "read" | "interested" | "decline" | "withdraw" | "expire";

const OFFER_TRANSITIONS: Record<OfferAction, { from: readonly JobOfferStatus[]; to: JobOfferStatus }> = {
  read: { from: ["SENT"], to: "READ" },
  interested: { from: ["SENT", "READ"], to: "INTERESTED" },
  decline: { from: OPEN_OFFER_STATUSES, to: "DECLINED" },
  withdraw: { from: OPEN_OFFER_STATUSES, to: "WITHDRAWN" },
  expire: { from: ["SENT", "READ"], to: "EXPIRED" },
};

export function nextOfferStatus(current: JobOfferStatus, action: OfferAction): JobOfferStatus | null {
  const t = OFFER_TRANSITIONS[action];
  return t.from.includes(current) ? t.to : null;
}

export const offerFromStatuses = (action: OfferAction): readonly JobOfferStatus[] => OFFER_TRANSITIONS[action].from;

export const isOpenOffer = (status: JobOfferStatus): boolean => OPEN_OFFER_STATUSES.includes(status);

/**
 * Thread trao đổi mở khi: lời mời INTERESTED, chưa bị khoá (chặn/thu hồi/ẩn danh) VÀ công ty còn APPROVED. Công ty tạm ngưng KHÔNG ghi `threadLocked`
 * (tránh phải mở khoá lại đúng tập offer khi khôi phục) mà suy ra ở đây → lời mời mở hiển thị "chỉ đọc".
 */
export function isThreadOpen(offer: { status: JobOfferStatus; threadLocked: boolean }, companyStatus: CompanyStatus): boolean {
  return offer.status === "INTERESTED" && !offer.threadLocked && companyStatus === "APPROVED";
}

/** `threadLocked` HIỆU LỰC gửi client (đã tính tạm ngưng công ty). */
export const effectiveThreadLocked = (offer: { threadLocked: boolean }, companyStatus: CompanyStatus): boolean => offer.threadLocked || companyStatus !== "APPROVED";

export type CompanyScopeAction = "company.view" | "company.manage" | "company.talent" | "company.offer";

/**
 * Tập action của thành viên ACTIVE trong công ty (`COMPANY` scope): `view` luôn có; `manage` chỉ OWNER (mọi trạng thái — OWNER phải sửa được hồ sơ
 * khi PENDING/REJECTED và gửi duyệt lại); `talent`/`offer` CHỈ khi công ty APPROVED (PENDING/REJECTED/SUSPENDED → `RECR_002`).
 */
export function companyActionsFor(status: CompanyStatus, role: CompanyMemberRole): CompanyScopeAction[] {
  const actions: CompanyScopeAction[] = ["company.view"];
  if (role === "OWNER") actions.push("company.manage");
  if (status === "APPROVED") actions.push("company.talent", "company.offer");
  return actions;
}

/** Quyền theo dữ liệu (`recruiter:*`) cho provider `CompanyPermissionProvider` (be.md §5). */
export function dataPermissionsFor(status: CompanyStatus, role: CompanyMemberRole): Array<"recruiter:view" | "recruiter:create" | "recruiter:update"> {
  const keys: Array<"recruiter:view" | "recruiter:create" | "recruiter:update"> = ["recruiter:view"];
  if (status === "APPROVED") {
    keys.push("recruiter:create");
    if (role === "OWNER") keys.push("recruiter:update");
  }
  return keys;
}

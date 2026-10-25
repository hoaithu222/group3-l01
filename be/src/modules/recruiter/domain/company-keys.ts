import { normalizeSearch } from "../../../core/utils/normalize";

/**
 * Khoá chống trùng doanh nghiệp (`Company.nameKey`/`taxCodeKey`, unique). HÀM THUẦN.
 *
 * ⚠ Mongo coi giá trị vắng/null là MỘT giá trị trong unique index (chỉ một tài liệu "không có" được phép) nên hai khoá này là chuỗi KHÔNG BAO GIỜ null:
 *  - có MST hợp lệ → khoá = MST bỏ dấu gạch/khoảng trắng; không có MST → sentinel `none:<companyId>` (mỗi công ty một khoá riêng);
 *  - công ty bị REJECTED nhả cả hai khoá bằng sentinel `rejected:<id>` / `none:<id>` để người khác (hoặc chính họ sau khi sửa) đăng ký lại; `resubmit` tranh lại khoá.
 */
export const nameKeyOf = (name: string): string => normalizeSearch(name).replace(/[^\p{L}\p{N}]/gu, "");

export const taxCodeKeyOf = (taxCode: string | null | undefined, companyId: string): string => {
  const digits = (taxCode ?? "").replace(/[^0-9]/g, "");
  return digits.length > 0 ? digits : `none:${companyId}`;
};

export const releasedNameKey = (companyId: string): string => `rejected:${companyId}`;
export const releasedTaxCodeKey = (companyId: string): string => `none:${companyId}`;

/** Tên miền của website (`https://www.acme.vn/about` → `acme.vn`) để vận hành đối chiếu email nhân sự; URL hỏng → `null`. */
export function emailDomainOf(website: string): string | null {
  try {
    const host = new URL(website).hostname.toLowerCase().replace(/^www\./, "");
    return host.length > 0 ? host : null;
  } catch {
    return null;
  }
}

/** `CompanyMember.activeKey`: `<userId>` khi ACTIVE (một người ≤ 1 doanh nghiệp), `removed:<memberId>` khi đã gỡ. */
export const memberActiveKey = (userId: string): string => userId;
export const memberRemovedKey = (memberId: string): string => `removed:${memberId}`;

/** `JobOffer.activeKey`: `<companyId>:<studentId>` khi còn mở (SENT|READ|INTERESTED), `closed:<offerId>` khi đã đóng. */
export const offerOpenKey = (companyId: string, studentId: string): string => `${companyId}:${studentId}`;
export const offerClosedKey = (offerId: string): string => `closed:${offerId}`;

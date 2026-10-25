import type { CompanyMemberView } from '../types/company.types';

/** Tên miền của một email (`an@acme.vn` → `acme.vn`), chữ thường; không có `@` → `null`. */
export function domainOfEmail(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

/**
 * Email của CHỦ SỞ HỮU có cùng tên miền với website doanh nghiệp không (admin.md p6-08 §2.1 — tín hiệu duyệt: `an@gmail.com` đăng ký `acme.vn` đáng ngờ hơn `an@acme.vn`).
 * Khớp cả tên miền phụ (`hr.acme.vn` ↔ `acme.vn`). Trả `true` CHỈ khi KHÔNG chủ sở hữu nào cùng tên miền — chỉ cần một người khớp là đủ.
 * Không đủ dữ liệu để so (không có tên miền website, không có chủ sở hữu, hoặc email chủ sở hữu trống vì tài khoản đã ẩn danh) → `false`: không cảnh báo khi không có gì để so.
 */
export function ownerEmailMismatchesWebsite(
  members: readonly Pick<CompanyMemberView, 'role' | 'email'>[],
  websiteDomain: string | null,
): boolean {
  if (!websiteDomain) return false;
  const site = websiteDomain.toLowerCase();
  const domains = members
    .filter((m) => m.role === 'OWNER')
    .map((m) => domainOfEmail(m.email))
    .filter((d): d is string => d !== null);
  if (domains.length === 0) return false;
  return domains.every((d) => d !== site && !d.endsWith(`.${site}`));
}

/**
 * Đường dẫn cổng HR p6-08 — nối sau `appConfig.apiBaseUrl` (đã chứa `/v1`). Khớp `be/src/modules/recruiter/{companies,talent,offers}.routes.ts`.
 * `companyId` nằm trong ĐƯỜNG DẪN và server luôn kiểm nhân sự ACTIVE (`companyScope`) — người ngoài, kể cả `admin`/`manager` vận hành, nhận 404 trung tính.
 * Mọi route cần cờ `career` VÀ công tắc `recruiter.enabled` (tắt cái nào cũng `404 CFG_005`).
 */
const seg = encodeURIComponent;
const company = (id: string) => `/companies/${seg(id)}`;

export const portalApi = {
  /** GET → `MyCompany` (kể cả PENDING/REJECTED/SUSPENDED); 404 `RES_001` chưa thuộc doanh nghiệp nào. */
  myCompany: '/me/company',
  /** POST đăng ký (PENDING, người đăng ký là OWNER): `RECR_001` đã thuộc doanh nghiệp, `RECR_004` trùng tên/MST, 3 lần/ngày. */
  companies: '/companies',
  company,
  /** POST — OWNER gửi duyệt lại khi REJECTED (`RECR_009` khi không phải REJECTED). */
  resubmit: (id: string) => `${company(id)}/resubmit`,
  usage: (id: string) => `${company(id)}/usage`,
  members: (id: string) => `${company(id)}/members`,
  member: (id: string, userId: string) => `${company(id)}/members/${seg(userId)}`,

  /** GET `?skills&minContribution&minBadges&role&location&q&cursor&limit` — CHỈ công ty APPROVED (`RECR_002`). */
  talentSearch: (id: string) => `${company(id)}/talent/search`,
  /** GET — 404 khi ứng viên đã tắt Open to work/chặn công ty; `RECR_010` quá 300 lượt/ngày; MỖI lượt ghi nhật ký. */
  talent: (id: string, userId: string) => `${company(id)}/talent/${seg(userId)}`,
  talentProof: (id: string, userId: string, skillId: string) =>
    `${company(id)}/talent/${seg(userId)}/skills/${seg(skillId)}/proof`,
  /** GET danh mục kỹ năng đang bật (chỉ cờ `career`) — nguồn cho ô lọc kỹ năng. */
  skills: '/skills',

  /** POST gửi lời mời (`Idempotency-Key`); GET danh sách (`cursor`, `status`, `recruiterId`). */
  offers: (id: string) => `${company(id)}/offers`,
  offer: (id: string, offerId: string) => `${company(id)}/offers/${seg(offerId)}`,
  withdraw: (id: string, offerId: string) => `${company(id)}/offers/${seg(offerId)}/withdraw`,
  /** GET/POST trao đổi trong lời mời (cả hai bên; POST chỉ khi INTERESTED — `RECR_008`). */
  messages: (offerId: string) => `/offers/${seg(offerId)}/messages`,
} as const;

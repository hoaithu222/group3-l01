/**
 * Đường dẫn kiểm duyệt portfolio — khớp `be/src/modules/portfolio/admin-portfolio.routes.ts` (p6-07). `moderation:view` xem,
 * `moderation:update` gỡ/mở lại (lý do + audit `portfolio.takedown|restore`). Không gắn cờ tính năng: vận hành gỡ được cả khi
 * cờ `career` đang tắt (trang công khai đã 404 nhưng dữ liệu vẫn cần xử lý).
 */

/** `id` từ BE đi vào đường dẫn → mã hoá để không chèn được `/`, `?`, `#`. */
const seg = encodeURIComponent;

export const portfolioModerationApi = {
  /** GET (`moderation:view`) — metadata (id, chủ, slug, trạng thái, liên kết, thông tin gỡ), KHÔNG nội dung hồ sơ; 404 khi không còn. */
  detail: (portfolioId: string) => `/admin/portfolios/${seg(portfolioId)}`,
  /** POST (`moderation:update`) `{ reason, reportGroupKey? }` — gỡ NGAY (trang 404), thông báo chủ hồ sơ, đóng báo cáo mở. Idempotent. */
  takedown: (portfolioId: string) => `/admin/portfolios/${seg(portfolioId)}/takedown`,
  /** POST (`moderation:update`) `{ reason }` — mở lại (KHÔNG tự công khai lại); `409 PORT_012` khi hồ sơ không bị gỡ. */
  restore: (portfolioId: string) => `/admin/portfolios/${seg(portfolioId)}/restore`,
} as const;

/** Mã BE khi mở lại một hồ sơ không ở trạng thái bị gỡ (đã có người mở lại) — đồng bộ lại thay vì kẹt hộp thoại. */
export const PORTFOLIO_NOT_TAKEN_DOWN_CODE = 'PORT_012';

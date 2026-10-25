/**
 * Kiểu cho gỡ/mở lại PORTFOLIO trong kiểm duyệt (p6-07) — viết tay theo `AdminPortfolioDto` ở
 * `be/src/modules/portfolio/services/portfolio.presenter.ts` (`GET /admin/portfolios/:portfolioId`). CHỈ metadata:
 * KHÔNG có nội dung hồ sơ (giới thiệu, dự án, số liệu) — admin xem trang công khai qua liên kết như mọi người dùng.
 */
export type PortfolioStatus = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';

export interface AdminPortfolio {
  id: string;
  /** Chủ hồ sơ — chỉ id (tên nằm ở khối ngữ cảnh của báo cáo). */
  userId: string;
  slug: string;
  displayName: string;
  status: PortfolioStatus;
  /** Đường dẫn công khai; `null` khi không còn công khai (nháp / đã ngừng / đã gỡ). */
  publicUrl: string | null;
  takenDownAt: string | null;
  /** Id quản trị viên đã gỡ (không có tên). */
  takenDownBy: string | null;
  takedownReason: string | null;
  publishedAt: string | null;
  version: number;
}

/** `POST /admin/portfolios/:id/takedown` — `reason` 10–500 ký tự (`reasonSchema` BE), `reportGroupKey` tuỳ chọn (≤ 120, ghi vào audit). */
export interface PortfolioTakedownPayload {
  portfolioId: string;
  reason: string;
  reportGroupKey?: string;
}

/** `POST /admin/portfolios/:id/restore` — `reason` 10–500 ký tự. */
export interface PortfolioRestorePayload {
  portfolioId: string;
  reason: string;
}

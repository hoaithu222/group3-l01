import type { AdminPortfolio } from '../types/portfolio-moderation.types';

export interface PortfolioStatusMeta {
  label: string;
  color: 'success' | 'warning' | 'error' | 'neutral';
}

/**
 * Nhãn trạng thái portfolio (luôn là CHỮ). `takenDownAt` thắng mọi trạng thái khác: hồ sơ bị gỡ giữ nguyên `status` cũ ở BE
 * (`PUBLISHED`) nhưng trang đã 404 và chủ hồ sơ không đăng lại được — hiện "Đã bị gỡ" mới đúng thực tế.
 */
export function portfolioStatusMeta(
  portfolio: Pick<AdminPortfolio, 'status' | 'takenDownAt'>,
): PortfolioStatusMeta {
  if (portfolio.takenDownAt) return { label: 'Đã bị gỡ (vi phạm)', color: 'error' };
  switch (portfolio.status) {
    case 'PUBLISHED':
      return { label: 'Đang công khai', color: 'success' };
    case 'UNPUBLISHED':
      return { label: 'Đã ngừng công khai', color: 'neutral' };
    case 'DRAFT':
      return { label: 'Bản nháp', color: 'neutral' };
    default:
      return { label: String(portfolio.status), color: 'neutral' };
  }
}

/** Chỉ cho `http(s)` làm `href` — giá trị đến từ BE, nhưng liên kết mở ra ngoài app nên không bao giờ tin `javascript:`/`data:`. */
export function safePublicUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

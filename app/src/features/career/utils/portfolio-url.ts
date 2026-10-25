import { Share } from 'react-native';

import { appConfig } from '@/core/config/env.config';

import { PORTFOLIO_PREVIEW_PATH } from '../api/portfolio.api';
import type { PortfolioAccent, PortfolioTemplate } from '../api/portfolio.types';
import { PORTFOLIO_ACCENTS, PORTFOLIO_TEMPLATES } from '../constants/portfolio.constants';

/**
 * Link dự kiến `<gốc>/<slug>` của hồ sơ CHƯA công khai (BE chỉ trả `publicUrl` khi PUBLISHED). Gốc lấy từ `EXPO_PUBLIC_PORTFOLIO_BASE_URL`, trống thì suy từ
 * `API_BASE_URL` (`env.config.ts`). Chỉ để HIỂN THỊ — không bao giờ mở/chia sẻ khi chưa công khai (trang 404).
 */
export const draftUrlOf = (slug: string): string => `${appConfig.portfolioBaseUrl}/${slug}`;

const isTemplate = (value: unknown): value is PortfolioTemplate =>
  typeof value === 'string' && (PORTFOLIO_TEMPLATES as readonly string[]).includes(value);
const isAccent = (value: unknown): value is PortfolioAccent =>
  typeof value === 'string' && (PORTFOLIO_ACCENTS as readonly string[]).includes(value);

/** Tham số route (`useLocalSearchParams`) → cặp thử mẫu; thiếu MỘT trong hai là không thử (BE cần cả hai để dựng đúng). */
export function trialFromParams(params: { template?: string; accent?: string }) {
  if (!isTemplate(params.template) || !isAccent(params.accent)) return undefined;
  return { accent: params.accent, template: params.template };
}

/** URL xem trước bản nháp (WebView gửi header Authorization ở lượt ĐẦU — xem `PortfolioPreviewScreen`). */
export function previewUrlOf(trial?: {
  template: PortfolioTemplate;
  accent: PortfolioAccent;
}): string {
  const base = `${appConfig.apiBaseUrl}${PORTFOLIO_PREVIEW_PATH}`;
  if (!trial) return base;
  return `${base}?template=${trial.template}&accent=${trial.accent}`;
}

/**
 * Chia sẻ link công khai bằng hộp chia sẻ hệ điều hành (`Share.share`, cùng mẫu `members/InviteCreatedSheet`). `message` chứa cả link: Android bỏ qua
 * trường `url`, còn iOS dán `message` cùng link cũng ổn.
 */
export async function sharePortfolioLink(url: string): Promise<void> {
  try {
    await Share.share({ message: `Xem hồ sơ portfolio của mình: ${url}` });
  } catch {
    // Người dùng đóng hộp chia sẻ / hệ điều hành từ chối: không phải lỗi cần báo.
  }
}

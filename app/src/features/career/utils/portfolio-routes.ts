import type { Href } from 'expo-router';

import type { PortfolioAccent, PortfolioTemplate } from '../api/portfolio.types';

/**
 * Đường dẫn các màn portfolio (app.md p6-07 §1) — nằm trong ngăn xếp `me/career/portfolio/*` (có `_layout.tsx` riêng). Không thêm tab, không đổi registry.
 * ⚠️ Ép `as Href` vì route mới chưa chắc có trong `.expo/types/router.d.ts` (sinh lúc `expo start`) — chuỗi thật luôn đúng, cùng cách `career-routes.ts`.
 */
export const PORTFOLIO_HREF = '/me/career/portfolio' as Href;
export const PORTFOLIO_PROFILE_HREF = '/me/career/portfolio/profile' as Href;
export const PORTFOLIO_APPEARANCE_HREF = '/me/career/portfolio/appearance' as Href;
export const PORTFOLIO_ADD_PROJECT_HREF = '/me/career/portfolio/projects/add' as Href;

export const portfolioProjectHref = (projectId: string): Href =>
  `/me/career/portfolio/projects/${encodeURIComponent(projectId)}` as Href;

/** Xem trước; `template`/`accent` = thử mẫu CHƯA lưu (BE `GET /me/portfolio/preview?template=&accent=`). ⛔ `if` chứ không `cond ? a : b` trên `Href` (TS2590). */
export function portfolioPreviewHref(trial?: {
  template: PortfolioTemplate;
  accent: PortfolioAccent;
}): Href {
  if (!trial) return '/me/career/portfolio/preview' as Href;
  return `/me/career/portfolio/preview?template=${trial.template}&accent=${trial.accent}` as Href;
}

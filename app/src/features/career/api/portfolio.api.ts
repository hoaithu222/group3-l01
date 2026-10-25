/**
 * Đường dẫn endpoint portfolio (p6-07 be.md §4; `be/src/modules/portfolio/portfolio.routes.ts`) — nối sau `appConfig.apiBaseUrl`. Mọi route BE đều
 * sau `requireFeature(career)` + công tắc khẩn cấp `portfolio.enabled` ⇒ cờ tắt trả 404 `CFG_005`. Trang công khai `/p/*` nằm NGOÀI `/api` (không có ở đây).
 */
export const MY_PORTFOLIO_PATH = '/me/portfolio';
export const PORTFOLIO_SLUG_PATH = '/me/portfolio/slug';
export const PORTFOLIO_SLUG_AVAILABLE_PATH = '/portfolio/slug-available';
export const PORTFOLIO_TEMPLATES_PATH = '/portfolio/templates';
export const PORTFOLIO_ELIGIBLE_PATH = '/me/portfolio/eligible-workspaces';
export const PORTFOLIO_PROJECTS_PATH = '/me/portfolio/projects';
export const PORTFOLIO_PROJECTS_ORDER_PATH = '/me/portfolio/projects/order';
export const PORTFOLIO_PREVIEW_PATH = '/me/portfolio/preview';
export const PORTFOLIO_PUBLISH_PATH = '/me/portfolio/publish';
export const PORTFOLIO_UNPUBLISH_PATH = '/me/portfolio/unpublish';
export const PORTFOLIO_LATEST_BUILD_PATH = '/me/portfolio/builds/latest';

export const portfolioProjectPath = (projectId: string) =>
  `${PORTFOLIO_PROJECTS_PATH}/${encodeURIComponent(projectId)}`;
export const portfolioProjectRefreshPath = (projectId: string) =>
  `${portfolioProjectPath(projectId)}/refresh`;

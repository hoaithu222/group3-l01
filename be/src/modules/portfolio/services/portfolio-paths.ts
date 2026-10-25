import { env } from "../../../core/config";

/** Gốc URL công khai (`PUBLIC_PORTFOLIO_BASE_URL`, không dấu `/` cuối); dev thiếu biến → `<PUBLIC_API_URL>/p`. */
export function portfolioBaseUrl(): string {
  return (env.PUBLIC_PORTFOLIO_BASE_URL ?? `${env.PUBLIC_API_URL}/p`).replace(/\/+$/, "");
}

/** Tiền tố khoá storage (luôn kết thúc bằng `/`). */
export function portfolioStoragePrefix(): string {
  return env.PORTFOLIO_STORAGE_PREFIX.endsWith("/") ? env.PORTFOLIO_STORAGE_PREFIX : `${env.PORTFOLIO_STORAGE_PREFIX}/`;
}

/** `<prefix><portfolioId>/b<n>/` — thư mục object của MỘT build. */
export const buildFolder = (prefix: string, portfolioId: string, buildVersion: number): string => `${prefix}${portfolioId}/b${buildVersion}/`;

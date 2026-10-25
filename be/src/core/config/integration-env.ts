/**
 * @file integration-env.ts
 * @description Bộ khoá env cần cho từng nhà cung cấp tích hợp (p5-03 README §7) — MỘT nơi quyết định "provider có `available` không", dùng chung
 * `validateRuntime()` (cảnh báo lúc khởi động), `IntegrationProvider.isConfigured()` và `/api/health`. Thiếu khoá ⇒ `available=false`, KHÔNG chặn
 * khởi động. Hàm thuần theo đối số `source` để test không phải sửa `env` toàn cục.
 */
import type { IntegrationProviderValue } from "../constants/integration";
import { env } from "./env.schema";

/** Các khoá env đọc được (kiểu hẹp, dễ dựng trong test). */
export type IntegrationEnvSource = Partial<
  Record<
    | "GITHUB_APP_ID"
    | "GITHUB_APP_PRIVATE_KEY"
    | "GITHUB_APP_SLUG"
    | "GITHUB_APP_CLIENT_ID"
    | "GITHUB_APP_CLIENT_SECRET"
    | "GITHUB_WEBHOOK_SECRET"
    | "GITLAB_CLIENT_ID"
    | "GITLAB_CLIENT_SECRET"
    | "GOOGLE_CLIENT_ID"
    | "GOOGLE_CLIENT_SECRET"
    | "FIGMA_CLIENT_ID"
    | "FIGMA_CLIENT_SECRET",
    string | undefined
  >
>;

/** Khoá env BẮT BUỘC theo nhà cung cấp. */
export const INTEGRATION_REQUIRED_ENV: Record<IntegrationProviderValue, readonly (keyof IntegrationEnvSource)[]> = {
  GITHUB: ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_SLUG", "GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET", "GITHUB_WEBHOOK_SECRET"],
  GITLAB: ["GITLAB_CLIENT_ID", "GITLAB_CLIENT_SECRET"],
  GOOGLE_CALENDAR: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  FIGMA: ["FIGMA_CLIENT_ID", "FIGMA_CLIENT_SECRET"],
};

export interface ProviderEnvStatus {
  provider: IntegrationProviderValue;
  configured: boolean;
  /** Tên các khoá còn thiếu (không bao giờ chứa GIÁ TRỊ). */
  missing: string[];
}

export function integrationProviderEnvStatus(
  provider: IntegrationProviderValue,
  source: IntegrationEnvSource = env
): ProviderEnvStatus {
  const missing = INTEGRATION_REQUIRED_ENV[provider].filter((key) => !source[key]?.trim());
  return { provider, configured: missing.length === 0, missing };
}

export function isIntegrationProviderConfigured(provider: IntegrationProviderValue, source: IntegrationEnvSource = env): boolean {
  return integrationProviderEnvStatus(provider, source).configured;
}

export function allIntegrationProviderEnvStatus(source: IntegrationEnvSource = env): ProviderEnvStatus[] {
  return (Object.keys(INTEGRATION_REQUIRED_ENV) as IntegrationProviderValue[]).map((p) => integrationProviderEnvStatus(p, source));
}

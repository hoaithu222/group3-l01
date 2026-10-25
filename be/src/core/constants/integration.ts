/**
 * Hằng số tích hợp bên thứ ba (p5-03) — MỘT nơi định nghĩa danh sách nhà cung cấp, khoá URL/`SystemConfig` và nhãn, dùng chung registry
 * (`core/config`), DTO/service của `modules/integrations` và test. Không import module/infrastructure (tầng `core`).
 */

/** Khoá nhà cung cấp trong URL (`/integrations/:provider/callback`, `/webhooks/:provider` dùng `google`) và trong `SystemConfig`. */
export const INTEGRATION_PROVIDER_KEYS = ["github", "gitlab", "google-calendar", "figma"] as const;
export type IntegrationProviderKey = (typeof INTEGRATION_PROVIDER_KEYS)[number];

/** Giá trị enum Prisma `IntegrationProvider`. */
export const INTEGRATION_PROVIDERS = ["GITHUB", "GITLAB", "GOOGLE_CALENDAR", "FIGMA"] as const;
export type IntegrationProviderValue = (typeof INTEGRATION_PROVIDERS)[number];

export const INTEGRATION_KEY_TO_PROVIDER: Record<IntegrationProviderKey, IntegrationProviderValue> = {
  github: "GITHUB",
  gitlab: "GITLAB",
  "google-calendar": "GOOGLE_CALENDAR",
  figma: "FIGMA",
};

export const INTEGRATION_PROVIDER_TO_KEY: Record<IntegrationProviderValue, IntegrationProviderKey> = {
  GITHUB: "github",
  GITLAB: "gitlab",
  GOOGLE_CALENDAR: "google-calendar",
  FIGMA: "figma",
};

export const INTEGRATION_PROVIDER_LABELS: Record<IntegrationProviderValue, string> = {
  GITHUB: "GitHub",
  GITLAB: "GitLab",
  GOOGLE_CALENDAR: "Google Calendar",
  FIGMA: "Figma",
};

/** Chủ sở hữu kết nối: nhóm (workspace) hay từng người dùng. */
export const INTEGRATION_PROVIDER_KIND: Record<IntegrationProviderValue, "WORKSPACE" | "USER"> = {
  GITHUB: "WORKSPACE",
  GITLAB: "WORKSPACE",
  GOOGLE_CALENDAR: "USER",
  FIGMA: "WORKSPACE",
};

/** Khoá registry `SystemConfig` giữ cờ bật/tắt từng nhà cung cấp (`providers.<key>.enabled`, mặc định BẬT). */
export const INTEGRATIONS_CONFIG_KEY = "integrations";

/** Loại sự kiện hỗ trợ theo nhà cung cấp (giá trị trong `Integration.config.events`). */
export const INTEGRATION_EVENT_TYPES: Record<IntegrationProviderValue, readonly string[]> = {
  GITHUB: ["push", "pull_request", "issues", "release"],
  GITLAB: ["push", "merge_request", "issues", "note", "release"],
  GOOGLE_CALENDAR: [],
  FIGMA: ["FILE_UPDATE", "FILE_COMMENT"],
};

/** Hợp mọi loại sự kiện — schema Zod của `PATCH /integrations/:id`. */
export const ALL_INTEGRATION_EVENT_TYPES = [
  "push",
  "pull_request",
  "issues",
  "release",
  "merge_request",
  "note",
  "FILE_UPDATE",
  "FILE_COMMENT",
] as const;

/** Nơi nhận tin hệ thống của kết nối: kênh, hoặc (P1) nhóm chat GROUP. */
export const INTEGRATION_TARGET_SCOPE_TYPES = ["CHANNEL", "CONVERSATION"] as const;
export type IntegrationTargetScopeType = (typeof INTEGRATION_TARGET_SCOPE_TYPES)[number];

/** Lý do (`Integration.statusReason` / `UserIntegration.statusReason`) — nhãn tiếng Việt ở app/admin. */
export const INTEGRATION_STATUS_REASONS = [
  "TARGET_FORBIDDEN",
  "TARGET_ARCHIVED",
  "PROVIDER_REVOKED",
  "PROVIDER_SUSPENDED",
  "TOKEN_INVALID",
  "HOOK_MISSING",
] as const;
export type IntegrationStatusReason = (typeof INTEGRATION_STATUS_REASONS)[number];

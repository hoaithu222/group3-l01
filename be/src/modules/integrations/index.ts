/**
 * Barrel của module `integrations` (p5-03). `integrations.routes.ts` gọi `registerIntegrationsModule()` lúc import (API): handler webhook
 * GitHub/GitLab/Figma vào registry của `webhooks` (route raw body `POST /webhooks/:provider`, p0-08), loại thông báo `integration.error`, listener
 * thu hồi quyền (INT-06). Worker đăng ký loại thông báo + listener + sink lịch họp + processor ở `jobs/integrations.jobs.ts`.
 */
import type { ProviderWebhookHandler } from "../webhooks/provider-webhook.registry";
import { registerProviderWebhookHandler } from "../webhooks/provider-webhook.registry";
import { getIntegrationsContainer } from "./integrations.container";
import { registerIntegrationRevokeListener } from "./jobs/integration-revoke-listener";
import { registerIntegrationNotificationTypes } from "./services/integration-notification-types";

/** Handler lười: container dựng ở request đầu tiên (test thay container bằng `setIntegrationsContainerForTests` TRƯỚC request). */
const lazyHandler = (key: "github" | "gitlab" | "figma"): ProviderWebhookHandler => ({
  receive: (req) => getIntegrationsContainer().webhooks[key].receive(req),
});

export function registerIntegrationsModule(): void {
  registerProviderWebhookHandler("GITHUB", lazyHandler("github"));
  registerProviderWebhookHandler("GITLAB", lazyHandler("gitlab"));
  registerProviderWebhookHandler("FIGMA", lazyHandler("figma"));
  registerIntegrationNotificationTypes();
  registerIntegrationRevokeListener();
}

export { getIntegrationsContainer, createIntegrationsContainer, setIntegrationsContainerForTests } from "./integrations.container";
export type { IntegrationsContainer, IntegrationsOverrides } from "./integrations.container";

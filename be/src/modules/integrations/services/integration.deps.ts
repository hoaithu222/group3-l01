import type { ProviderRegistry } from "../providers/provider.registry";
import type { ICalendarLinkRepository } from "../repositories/calendar-link.repository.interface";
import type { IIntegrationEventRepository } from "../repositories/integration-event.repository.interface";
import type { IIntegrationRepository } from "../repositories/integration.repository.interface";
import type { IUserIntegrationRepository } from "../repositories/user-integration.repository.interface";
import type { AuditRecorder, IIntegrationAccess, IIntegrationDirectory, IIntegrationJobs } from "./integration.ports";
import type { IntegrationStatusService } from "./integration-status.service";
import type { IntegrationTargetService } from "./integration-target.service";
import type { OAuthStateStore } from "./oauth-state.store";
import type { ProviderAvailability } from "./provider-availability";
import type { TokenService } from "./token.service";

/** Đồ thị phụ thuộc chung của các dịch vụ tích hợp (dựng ở `integrations.container.ts`; test dựng bằng đồ giả/in-memory). */
export interface IntegrationDeps {
  integrations: IIntegrationRepository;
  userIntegrations: IUserIntegrationRepository;
  calendarLinks: ICalendarLinkRepository;
  events: IIntegrationEventRepository;
  registry: ProviderRegistry;
  availability: ProviderAvailability;
  state: OAuthStateStore;
  target: IntegrationTargetService;
  status: IntegrationStatusService;
  tokens: TokenService;
  directory: IIntegrationDirectory;
  access: IIntegrationAccess;
  jobs: IIntegrationJobs;
  audit: AuditRecorder;
  /** `redirect_uri` OAuth của nhà cung cấp (`<khoá URL>` = `github|gitlab|figma|google-calendar`). */
  callbackUrl: (providerKey: string) => string;
  /** URL nhận webhook của nhà cung cấp (tạo hook GitLab/Figma). */
  webhookUrl: (webhookKey: "github" | "gitlab" | "figma" | "google") => string;
  now: () => Date;
}

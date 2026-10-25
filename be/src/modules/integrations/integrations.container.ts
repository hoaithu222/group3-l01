import { runtimeConfig } from "../../core/config/runtime-config";
import { env } from "../../core/config";
import { INTEGRATIONS_CONFIG_KEY } from "../../core/constants/integration";
import { MODULES } from "../../core/constants/modules";
import { AuditService } from "../audit-log/audit-log.service";
import { createSystemMessageService, type ISystemMessagePort } from "../messages/public";
import { FigmaProvider, FIGMA_HOSTS } from "./providers/figma.provider";
import { GithubAppProvider, GITHUB_HOSTS } from "./providers/github-app.provider";
import { GitlabProvider } from "./providers/gitlab.provider";
import { GoogleCalendarProvider, GOOGLE_HOSTS, type ICalendarClient } from "./providers/google-calendar.provider";
import { ProviderHttp } from "./providers/provider-http";
import type { IntegrationProvider } from "./providers/provider.interface";
import { ProviderRegistry } from "./providers/provider.registry";
import { RedisTokenCache } from "./providers/token-cache";
import { PrismaCalendarLinkRepository } from "./repositories/calendar-link.repository.prisma";
import { PrismaIntegrationEventRepository } from "./repositories/integration-event.repository.prisma";
import { PrismaIntegrationRepository } from "./repositories/integration.repository.prisma";
import { PrismaUserIntegrationRepository } from "./repositories/user-integration.repository.prisma";
import { CalendarSyncService } from "./services/calendar-sync.service";
import { IntegrationAdminService } from "./services/integration-admin.service";
import { IntegrationConnectService } from "./services/integration-connect.service";
import { IntegrationEventsService } from "./services/integration-events.service";
import { BullIntegrationJobs } from "./services/integration-jobs";
import { IntegrationMaintenanceService } from "./services/integration-maintenance.service";
import { IntegrationService } from "./services/integration.service";
import {
  NotifyIntegrationNotifier,
  PermissionIntegrationAccess,
  PrismaIntegrationDirectory,
  SocketIntegrationEmitter,
  SystemConfigProviderStore,
} from "./services/integration.adapters";
import type { IntegrationDeps } from "./services/integration.deps";
import type {
  AuditRecorder,
  IIntegrationAccess,
  IIntegrationDirectory,
  IIntegrationEmitter,
  IIntegrationJobs,
  IIntegrationNotifier,
  IMeetingCalendarReader,
  IProviderConfigStore,
} from "./services/integration.ports";
import { IntegrationStatusService } from "./services/integration-status.service";
import { IntegrationTargetService } from "./services/integration-target.service";
import { PrismaMeetingCalendarReader } from "./services/meeting-calendar.reader";
import { OAuthStateStore } from "./services/oauth-state.store";
import { oauthCallbackUrl, webhookEndpointUrl } from "./services/oauth-redirect";
import { ProviderAvailability } from "./services/provider-availability";
import { TokenService } from "./services/token.service";
import { UserIntegrationService } from "./services/user-integration.service";
import { WebhookDispatcherService } from "./services/webhook-dispatcher.service";
import { WebhookProcessService } from "./services/webhook-process.service";

/** Cổng thay được khi dựng đồ thị cho test (mặc định là bản thật). Test KHÔNG gọi mạng: truyền `providers`/`calendar` giả. */
export interface IntegrationsOverrides {
  providers?: IntegrationProvider[];
  calendar?: ICalendarClient;
  systemMessages?: ISystemMessagePort;
  jobs?: IIntegrationJobs;
  notifier?: IIntegrationNotifier;
  emitter?: IIntegrationEmitter;
  directory?: IIntegrationDirectory;
  access?: IIntegrationAccess;
  meetings?: IMeetingCalendarReader;
  providerConfig?: IProviderConfigStore;
  state?: OAuthStateStore;
  audit?: AuditRecorder;
  moduleEnabled?: () => Promise<boolean>;
  now?: () => Date;
}

export interface IntegrationsContainer {
  deps: IntegrationDeps;
  service: IntegrationService;
  connect: IntegrationConnectService;
  events: IntegrationEventsService;
  users: UserIntegrationService;
  admin: IntegrationAdminService;
  maintenance: IntegrationMaintenanceService;
  calendarSync: CalendarSyncService;
  webhookProcess: WebhookProcessService;
  /** Handler `POST /webhooks/<github|gitlab|figma>` (đăng ký vào registry của `webhooks`). */
  webhooks: { github: WebhookDispatcherService; gitlab: WebhookDispatcherService; figma: WebhookDispatcherService };
}

function defaultProviders(): IntegrationProvider[] {
  const gitlabHost = new URL(env.GITLAB_BASE_URL).hostname;
  return [
    new GithubAppProvider(new ProviderHttp(GITHUB_HOSTS), new RedisTokenCache()),
    new GitlabProvider(new ProviderHttp([gitlabHost])),
    new FigmaProvider(new ProviderHttp(FIGMA_HOSTS)),
    new GoogleCalendarProvider(new ProviderHttp(GOOGLE_HOSTS)),
  ];
}

const meetingWebBase = (): string => (env.PUBLIC_WEB_BASE_URL ?? env.FRONTEND_URL).replace(/\/+$/, "");

/** Dựng đồ thị phụ thuộc DUY NHẤT của module (routes API + job worker dùng chung, như `getContributionContainer()`). */
export function createIntegrationsContainer(o: IntegrationsOverrides = {}): IntegrationsContainer {
  const now = o.now ?? (() => new Date());
  const providers = o.providers ?? defaultProviders();
  const registry = new ProviderRegistry(providers);
  const integrations = new PrismaIntegrationRepository();
  const userIntegrations = new PrismaUserIntegrationRepository();
  const calendarLinks = new PrismaCalendarLinkRepository();
  const events = new PrismaIntegrationEventRepository();
  const directory = o.directory ?? new PrismaIntegrationDirectory();
  const access = o.access ?? new PermissionIntegrationAccess();
  const jobs = o.jobs ?? new BullIntegrationJobs();
  const availability = new ProviderAvailability({
    registry,
    readConfig: () => runtimeConfig.getEffective(INTEGRATIONS_CONFIG_KEY),
    moduleEnabled: o.moduleEnabled ?? (() => runtimeConfig.isFeatureEnabled(MODULES.INTEGRATION)),
  });
  const status = new IntegrationStatusService({
    integrations,
    userIntegrations,
    directory,
    notifier: o.notifier ?? new NotifyIntegrationNotifier(),
    emitter: o.emitter ?? new SocketIntegrationEmitter(),
    now,
  });
  const tokens = new TokenService({ registry, integrations, userIntegrations, status, jobs, now });
  const deps: IntegrationDeps = {
    integrations,
    userIntegrations,
    calendarLinks,
    events,
    registry,
    availability,
    state: o.state ?? new OAuthStateStore(),
    target: new IntegrationTargetService(directory, access),
    status,
    tokens,
    directory,
    access,
    jobs,
    audit: o.audit ?? new AuditService(),
    callbackUrl: oauthCallbackUrl,
    webhookUrl: webhookEndpointUrl,
    now,
  };
  const google = registry.get("GOOGLE_CALENDAR");
  const calendar = o.calendar ?? (google as unknown as ICalendarClient);
  const calendarSync = new CalendarSyncService({
    userIntegrations,
    calendarLinks,
    meetings: o.meetings ?? new PrismaMeetingCalendarReader(),
    calendar,
    tokens,
    status,
    jobs,
    availability,
    meetingUrl: (code) => `${meetingWebBase()}/m/${code}`,
    revokeRemote: google?.revoke ? (t) => google.revoke!({ externalAccountId: "", tokens: t }) : undefined,
    now,
  });
  let systemMessages = o.systemMessages;
  const lazySystemMessages: ISystemMessagePort = {
    post: (input, tx) => (systemMessages ??= createSystemMessageService()).post(input, tx),
  };
  return {
    deps,
    service: new IntegrationService(deps),
    connect: new IntegrationConnectService(deps),
    events: new IntegrationEventsService(deps),
    users: new UserIntegrationService(deps, calendarSync),
    admin: new IntegrationAdminService(deps, o.providerConfig ?? new SystemConfigProviderStore()),
    maintenance: new IntegrationMaintenanceService(deps),
    calendarSync,
    webhookProcess: new WebhookProcessService(deps, lazySystemMessages),
    webhooks: {
      github: new WebhookDispatcherService(deps, "GITHUB"),
      gitlab: new WebhookDispatcherService(deps, "GITLAB"),
      figma: new WebhookDispatcherService(deps, "FIGMA"),
    },
  };
}

let container: IntegrationsContainer | null = null;

export function getIntegrationsContainer(): IntegrationsContainer {
  container ??= createIntegrationsContainer();
  return container;
}

/** Chỉ dùng trong test: thay container (routes/job đọc lại qua `getIntegrationsContainer()` mỗi lần gọi). */
export function setIntegrationsContainerForTests(next: IntegrationsContainer | null): void {
  container = next;
}

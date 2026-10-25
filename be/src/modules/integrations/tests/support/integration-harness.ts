/**
 * Đồ giả dùng chung cho unit test `integrations` (KHÔNG phải test): dựng `IntegrationDeps` bằng repository in-memory, nhà cung cấp giả (không gọi mạng),
 * cổng quyền/thư mục/thông báo/realtime/job ghi nhận lời gọi. Mọi hành vi mặc định là "thuận lợi"; test tự đổi cờ trên đồ giả để tạo tình huống.
 */
import { createHmac } from "node:crypto";
import type { IntegrationProviderValue, IntegrationTargetScopeType } from "../../../../core/constants/integration";
import type { IntegrationEntity } from "../../entities/integration.interface";
import { GithubAppProvider, type GithubAppConfig } from "../../providers/github-app.provider";
import { ProviderHttp } from "../../providers/provider-http";
import type { ExchangeInput, ExchangeResult, IntegrationProvider, TokenSet } from "../../providers/provider.interface";
import { ProviderRegistry } from "../../providers/provider.registry";
import { MemoryTokenCache } from "../../providers/token-cache";
import { InMemoryCalendarLinkRepository } from "../../repositories/calendar-link.repository.inmemory";
import { InMemoryIntegrationEventRepository } from "../../repositories/integration-event.repository.inmemory";
import { InMemoryIntegrationRepository } from "../../repositories/integration.repository.inmemory";
import { InMemoryUserIntegrationRepository } from "../../repositories/user-integration.repository.inmemory";
import type { IntegrationDeps } from "../../services/integration.deps";
import type {
  CalendarSyncJob,
  IIntegrationAccess,
  IIntegrationDirectory,
  IIntegrationEmitter,
  IIntegrationJobs,
  IIntegrationNotifier,
  IntegrationErrorNotice,
  TargetChannelInfo,
  WorkspaceInfo,
} from "../../services/integration.ports";
import { IntegrationStatusService } from "../../services/integration-status.service";
import { IntegrationTargetService } from "../../services/integration-target.service";
import { OAuthStateStore } from "../../services/oauth-state.store";
import { ProviderAvailability } from "../../services/provider-availability";
import { TokenService } from "../../services/token.service";

export const WS = "650000000000000000000001";
export const OWNER = "650000000000000000000011";
export const ADMIN = "650000000000000000000012";
export const MEMBER = "650000000000000000000013";
export const CHANNEL = "650000000000000000000021";
export const PRIVATE_CHANNEL = "650000000000000000000022";
export const GITHUB_SECRET = "test-github-webhook-secret";

/** GitHub App thật (HMAC, parse, mapper) nhưng coi như đã cấu hình khoá; gọi mạng qua `fetch` giả (lỗi nếu bị gọi). */
export class TestGithubProvider extends GithubAppProvider {
  constructor(cfg: Partial<GithubAppConfig> = {}) {
    const full: GithubAppConfig = { appId: "1", privateKey: "", slug: "super-app-test", clientId: "cid", clientSecret: "cs", webhookSecret: GITHUB_SECRET, ...cfg };
    super(new ProviderHttp(["api.github.com", "github.com"], { fetchImpl: () => Promise.reject(new Error("không gọi mạng trong test")) }), new MemoryTokenCache(), () => full);
  }
  override isConfigured(): boolean {
    return true;
  }
}

/** Nhà cung cấp OAuth giả cấp workspace (không mạng) — `exchange` trả tài khoản cố định, đếm số lần gọi. */
export class FakeOAuthProvider implements IntegrationProvider {
  readonly kind = "WORKSPACE" as const;
  configured = true;
  exchanges: ExchangeInput[] = [];
  result: ExchangeResult = { externalAccountId: "4242", externalName: "vci-org" };
  constructor(readonly provider: IntegrationProviderValue = "GITHUB") {}
  isConfigured(): boolean {
    return this.configured;
  }
  authorizeUrl(input: { state: string }): string {
    return `https://github.com/apps/test/installations/new?state=${input.state}`;
  }
  exchange(input: ExchangeInput): Promise<ExchangeResult> {
    this.exchanges.push(input);
    return Promise.resolve(this.result);
  }
}

/** Google giả: chỉ phần OAuth/refresh (lịch đi qua `FakeCalendarClient`). `refreshWith` = kết quả lần làm mới kế tiếp. */
export class FakeGoogleProvider implements IntegrationProvider {
  readonly provider = "GOOGLE_CALENDAR" as const;
  readonly kind = "USER" as const;
  readonly usesPkce = true;
  refreshCalls = 0;
  refreshWith: TokenSet | Error = { accessToken: "at-2", refreshToken: null, expiresAt: new Date(Date.now() + 3600_000) };
  isConfigured(): boolean {
    return true;
  }
  authorizeUrl(): string {
    return "https://accounts.google.com/o/oauth2/v2/auth";
  }
  exchange(): Promise<ExchangeResult> {
    return Promise.resolve({ externalAccountId: "a@gmail.com", externalName: "a@gmail.com", tokens: { accessToken: "at-1", refreshToken: "rt-1", expiresAt: new Date(Date.now() + 3600_000) } });
  }
  refresh(): Promise<TokenSet> {
    this.refreshCalls += 1;
    return this.refreshWith instanceof Error ? Promise.reject(this.refreshWith) : Promise.resolve(this.refreshWith);
  }
}

export class FakeDirectory implements IIntegrationDirectory {
  channels = new Map<string, TargetChannelInfo>([
    [CHANNEL, { id: CHANNEL, workspaceId: WS, name: "chung", type: "TEXT", visibility: "PUBLIC", status: "ACTIVE" }],
    [PRIVATE_CHANNEL, { id: PRIVATE_CHANNEL, workspaceId: WS, name: "bi-mat", type: "TEXT", visibility: "PRIVATE", status: "ACTIVE" }],
  ]);
  workspace: WorkspaceInfo = { id: WS, name: "Nhóm A", status: "ACTIVE", defaultChannelId: CHANNEL };
  getChannel = (id: string) => Promise.resolve(this.channels.get(id) ?? null);
  getConversation = () => Promise.resolve(null);
  getWorkspace = (id: string) => Promise.resolve(id === WS ? this.workspace : null);
  getWorkspaces = (ids: string[]) => Promise.resolve(new Map(ids.filter((i) => i === WS).map((i) => [i, this.workspace])));
  getUserNames = (ids: string[]) => Promise.resolve(new Map(ids.map((i) => [i, `Người ${i.slice(-2)}`])));
  listMemberIdsByRole = (_ws: string, roles: Array<"OWNER" | "ADMIN">) => Promise.resolve([...(roles.includes("OWNER") ? [OWNER] : []), ...(roles.includes("ADMIN") ? [ADMIN] : [])]);
}

/** Vai trò theo người + tập (người, đích) KHÔNG có quyền ghi (mặc định ai cũng ghi được). */
export class FakeAccess implements IIntegrationAccess {
  roles = new Map<string, string>([
    [OWNER, "OWNER"],
    [ADMIN, "ADMIN"],
    [MEMBER, "MEMBER"],
  ]);
  denyWrite = new Set<string>();
  workspaceAccess = (userId: string) => Promise.resolve({ visible: this.roles.has(userId), role: this.roles.get(userId) ?? null });
  canWriteTarget = (userId: string, _t: IntegrationTargetScopeType, scopeId: string) => Promise.resolve(!this.denyWrite.has(`${userId}:${scopeId}`));
  canReadTarget = (userId: string, t: IntegrationTargetScopeType, scopeId: string) => this.canWriteTarget(userId, t, scopeId);
}

export class RecordingNotifier implements IIntegrationNotifier {
  notices: IntegrationErrorNotice[] = [];
  integrationError(n: IntegrationErrorNotice): Promise<void> {
    this.notices.push(n);
    return Promise.resolve();
  }
}

export class RecordingEmitter implements IIntegrationEmitter {
  calls: Array<{ userIds: string[]; status: string }> = [];
  integrationUpdated(userIds: string[], p: { status: string }): void {
    this.calls.push({ userIds, status: p.status });
  }
}

export class RecordingJobs implements IIntegrationJobs {
  refreshes: Array<{ kind: string; id: string; expiresAt: Date }> = [];
  calendar: CalendarSyncJob[] = [];
  rechecks: unknown[] = [];
  cleanups: string[] = [];
  scheduleTokenRefresh = (kind: "WORKSPACE" | "USER", id: string, expiresAt: Date) => (this.refreshes.push({ kind, id, expiresAt }), Promise.resolve());
  enqueueCalendarSync = (job: CalendarSyncJob) => (this.calendar.push(job), Promise.resolve());
  enqueueTargetRecheck = (input: unknown) => (this.rechecks.push(input), Promise.resolve());
  enqueueCalendarCleanup = (id: string) => (this.cleanups.push(id), Promise.resolve());
}

export interface Harness {
  deps: IntegrationDeps;
  integrations: InMemoryIntegrationRepository;
  userIntegrations: InMemoryUserIntegrationRepository;
  calendarLinks: InMemoryCalendarLinkRepository;
  events: InMemoryIntegrationEventRepository;
  directory: FakeDirectory;
  access: FakeAccess;
  notifier: RecordingNotifier;
  emitter: RecordingEmitter;
  jobs: RecordingJobs;
  audits: Array<{ action: string; targetId: string }>;
  flags: { module: boolean; providers: Record<string, boolean> };
}

export function makeHarness(providers: IntegrationProvider[] = [new TestGithubProvider()], opts: { stateTtlSeconds?: number } = {}): Harness {
  const now = () => new Date();
  const integrations = new InMemoryIntegrationRepository(now);
  const userIntegrations = new InMemoryUserIntegrationRepository(now);
  const calendarLinks = new InMemoryCalendarLinkRepository();
  const events = new InMemoryIntegrationEventRepository(now);
  const directory = new FakeDirectory();
  const access = new FakeAccess();
  const notifier = new RecordingNotifier();
  const emitter = new RecordingEmitter();
  const jobs = new RecordingJobs();
  const registry = new ProviderRegistry(providers);
  const flags: Harness["flags"] = { module: true, providers: {} };
  const availability = new ProviderAvailability({
    registry,
    readConfig: () => Promise.resolve({ providers: Object.fromEntries(Object.entries(flags.providers).map(([k, v]) => [k, { enabled: v }])) }),
    moduleEnabled: () => Promise.resolve(flags.module),
  });
  const status = new IntegrationStatusService({ integrations, userIntegrations, directory, notifier, emitter, now });
  const tokens = new TokenService({ registry, integrations, userIntegrations, status, jobs, now });
  const audits: Harness["audits"] = [];
  const deps: IntegrationDeps = {
    integrations,
    userIntegrations,
    calendarLinks,
    events,
    registry,
    availability,
    state: new OAuthStateStore(opts.stateTtlSeconds ?? 600),
    target: new IntegrationTargetService(directory, access),
    status,
    tokens,
    directory,
    access,
    jobs,
    audit: { record: (i) => (audits.push({ action: i.action, targetId: i.targetId }), Promise.resolve()) },
    callbackUrl: (k) => `https://api.test/api/v1/integrations/${k}/callback`,
    webhookUrl: (k) => `https://api.test/api/v1/webhooks/${k}`,
    now,
  };
  return { deps, integrations, userIntegrations, calendarLinks, events, directory, access, notifier, emitter, jobs, audits, flags };
}

/** Kết nối GitHub đang ACTIVE, theo dõi repo `1001` (`vci/app`), mọi loại sự kiện, đích = kênh công khai. */
export async function seedGithub(h: Harness, over: Partial<{ createdBy: string; targetScopeId: string; events: string[] }> = {}): Promise<IntegrationEntity> {
  const { entity } = await h.integrations.upsert({
    workspaceId: WS,
    provider: "GITHUB",
    externalAccountId: "777",
    externalName: "vci",
    credentials: null,
    tokenExpiresAt: null,
    scopes: [],
    config: { repos: [{ id: "1001", fullName: "vci/app" }], events: over.events ?? ["push", "pull_request", "issues", "release"] },
    targetScopeType: "CHANNEL",
    targetScopeId: over.targetScopeId ?? CHANNEL,
    webhookSecretHash: null,
    createdBy: over.createdBy ?? ADMIN,
  });
  return entity;
}

/** Webhook GitHub ký đúng (hoặc sai nếu `secret` khác). */
export function githubDelivery(event: string, body: Record<string, unknown>, deliveryId: string, secret = GITHUB_SECRET): { rawBody: Buffer; headers: Record<string, string> } {
  const rawBody = Buffer.from(JSON.stringify(body));
  const sig = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  return { rawBody, headers: { "x-github-event": event, "x-github-delivery": deliveryId, "x-hub-signature-256": sig, "content-type": "application/json" } };
}

export function pushPayload(commits = 3): Record<string, unknown> {
  return {
    ref: "refs/heads/main",
    installation: { id: 777 },
    repository: { id: 1001, full_name: "vci/app", html_url: "https://github.com/vci/app" },
    sender: { login: "dev-a", avatar_url: "https://avatars.githubusercontent.com/u/1" },
    pusher: { name: "dev-a", email: "dev-a@example.com" },
    compare: "https://github.com/vci/app/compare/a...b",
    commits: Array.from({ length: commits }, (_, i) => ({ id: `abcdef${i}1234567890`, message: `Sửa lỗi ${i + 1}\n\nchi tiết`, author: { email: "x@y.z" } })),
  };
}

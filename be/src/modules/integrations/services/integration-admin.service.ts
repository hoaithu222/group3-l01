import {
  INTEGRATION_PROVIDER_LABELS,
  INTEGRATION_PROVIDER_TO_KEY,
  INTEGRATION_PROVIDERS,
  type IntegrationProviderValue,
} from "../../../core/constants/integration";
import { NotFoundError, ValidationError } from "../../../core/exceptions";
import { redactPayload } from "../providers/payload-redactor";
import type { AdminConnectionsQueryDto, AdminEventsQueryDto } from "../dtos/integration.dto";
import type { IntegrationEntity, IntegrationEventEntity } from "../entities/integration.interface";
import { intErrors } from "../integrations.errors";
import type { IntegrationDeps } from "./integration.deps";
import type { IProviderConfigStore } from "./integration.ports";
import { IntegrationEventsService, presentEvent, type IntegrationEventView } from "./integration-events.service";
import type { ProviderInfo } from "./provider-availability";

const DAY_MS = 24 * 60 * 60 * 1000;
const PROVIDER_OF_EVENT: Record<IntegrationEventEntity["provider"], IntegrationProviderValue> = { GITHUB: "GITHUB", GITLAB: "GITLAB", FIGMA: "FIGMA", GOOGLE: "GOOGLE_CALENDAR" };

export interface AdminActor {
  id: string;
  role?: string;
}

/** Dòng log ở admin: chỉ metadata (KHÔNG payload, KHÔNG nội dung tin). */
export interface AdminEventRow extends IntegrationEventView {
  provider: IntegrationEventEntity["provider"];
  eventId: string;
  integrationId: string | null;
  workspace: { id: string; name: string } | null;
}

export interface AdminEventDetail extends AdminEventRow {
  /** Payload ĐÃ CHE (`***` cho khoá/giá trị nhạy cảm) — không bao giờ trả bản gốc. */
  payload: unknown;
  attempts: number;
  /** Tin hệ thống đã tạo: chỉ id; tên kênh CHỈ khi kênh công khai (kênh riêng tư → `null`, admin không thấy tên). */
  message: { id: string; channel: { name: string | null; private: boolean } | null } | null;
  replays: Array<{ id: string; eventId: string; status: string; receivedAt: string }>;
}

export interface AdminProviderRow extends ProviderInfo {
  connections: { active: number; error: number; revoked: number };
  events24h: number;
  lastError: { message: string; at: string } | null;
}

export interface AdminConnectionRow {
  id: string;
  workspace: { id: string; name: string } | null;
  provider: IntegrationProviderValue;
  externalName: string;
  status: string;
  statusReason: string | null;
  createdBy: { id: string; name: string | null };
  lastEventAt: string | null;
  updatedAt: string;
}

/** Truy vấn/hành động của admin nền tảng (`/admin/integrations/*`): chỉ metadata + payload đã che; bật/tắt nhà cung cấp; phát lại sự kiện lỗi. */
export class IntegrationAdminService {
  private readonly events: IntegrationEventsService;

  constructor(
    private readonly d: IntegrationDeps,
    private readonly config: IProviderConfigStore
  ) {
    this.events = new IntegrationEventsService(d);
  }

  private async workspaceNames(ids: Array<string | null | undefined>): Promise<Map<string, { id: string; name: string }>> {
    const distinct = [...new Set(ids.filter((v): v is string => typeof v === "string"))];
    const found = await this.d.directory.getWorkspaces(distinct);
    return new Map([...found].map(([id, w]) => [id, { id, name: w.name }]));
  }

  private async rows(events: IntegrationEventEntity[]): Promise<AdminEventRow[]> {
    const integrationIds = [...new Set(events.map((e) => e.integrationId).filter((v): v is string => v !== null))];
    const integrations = new Map((await Promise.all(integrationIds.map((id) => this.d.integrations.findById(id)))).filter((i): i is IntegrationEntity => i !== null).map((i) => [i.id, i]));
    const workspaces = await this.workspaceNames([...integrations.values()].map((i) => i.workspaceId));
    const now = this.d.now();
    return events.map((e) => {
      const integration = e.integrationId ? integrations.get(e.integrationId) : undefined;
      return { ...presentEvent(e, now), provider: e.provider, eventId: e.eventId, integrationId: e.integrationId, workspace: integration ? (workspaces.get(integration.workspaceId) ?? null) : null };
    });
  }

  async listEvents(q: AdminEventsQueryDto): Promise<{ items: AdminEventRow[]; total: number }> {
    const integrationIds = q.workspaceId ? (await this.d.integrations.listByWorkspace(q.workspaceId)).map((i) => i.id) : undefined;
    if (integrationIds && integrationIds.length === 0) return { items: [], total: 0 };
    const { items, total } = await this.d.events.listAdmin({ provider: q.provider, status: q.status, integrationIds, from: q.from, to: q.to }, q.page, q.limit);
    return { items: await this.rows(items), total };
  }

  async getEvent(id: string): Promise<AdminEventDetail> {
    const event = await this.d.events.findById(id);
    if (!event) throw new NotFoundError();
    const [row] = await this.rows([event]);
    const integration = event.integrationId ? await this.d.integrations.findById(event.integrationId) : null;
    const channel = integration && event.messageId && integration.targetScopeType === "CHANNEL" ? await this.d.directory.getChannel(integration.targetScopeId) : null;
    const replays = await this.d.events.listReplays(event.replayOf ?? event.id, 20);
    return {
      ...(row as AdminEventRow),
      payload: event.payload === null ? null : redactPayload(event.payload, "display"),
      attempts: event.attempts,
      message: event.messageId ? { id: event.messageId, channel: channel ? { name: channel.visibility === "PRIVATE" ? null : channel.name, private: channel.visibility === "PRIVATE" } : null } : null,
      replays: replays.map((r) => ({ id: r.id, eventId: r.eventId, status: r.status, receivedAt: r.receivedAt.toISOString() })),
    };
  }

  /** Phát lại sự kiện `FAILED`/`IGNORED` (admin nền tảng, có lý do + audit). */
  async replayEvent(actor: AdminActor, id: string, reason: string): Promise<IntegrationEventView> {
    const event = await this.d.events.findById(id);
    if (!event) throw new NotFoundError();
    if (event.status !== "FAILED" && event.status !== "IGNORED") throw new ValidationError("Chỉ phát lại được sự kiện đã lỗi hoặc bị bỏ qua");
    const created = await this.events.createReplay(event);
    await this.d.audit.record({ actorId: actor.id, actorRole: actor.role, action: "integration.replay", targetType: "WebhookEvent", targetId: event.id, reason, metadata: { provider: event.provider, replayId: created.id } });
    return presentEvent(created, this.d.now());
  }

  async listProviders(): Promise<AdminProviderRow[]> {
    const [infos, stats, counts, errors] = await Promise.all([
      this.d.availability.describe(),
      this.d.integrations.providerStats(),
      this.d.events.countByProviderSince(new Date(this.d.now().getTime() - DAY_MS)),
      this.d.events.latestErrors(),
    ]);
    return infos.map((info) => {
      const eventKey = info.provider === "GOOGLE_CALENDAR" ? "GOOGLE" : info.provider;
      const of = (status: string) => stats.filter((s) => s.provider === info.provider && s.status === status).reduce((sum, s) => sum + s.count, 0);
      const err = errors[eventKey];
      return { ...info, connections: { active: of("ACTIVE"), error: of("ERROR"), revoked: of("REVOKED") }, events24h: counts[eventKey] ?? 0, lastError: err ? { message: err.error, at: err.at.toISOString() } : null };
    });
  }

  /** Bật/tắt một nhà cung cấp toàn hệ thống (ghi `SystemConfig` qua `SystemConfigService`: kiểm schema, CAS `version`, xoá cache đa instance + audit `system-config.update`). */
  async setProviderEnabled(actor: AdminActor, provider: IntegrationProviderValue, enabled: boolean, reason: string): Promise<AdminProviderRow> {
    if (!INTEGRATION_PROVIDERS.includes(provider)) throw new NotFoundError();
    const info = (await this.d.availability.describe()).find((p) => p.provider === provider);
    if (enabled && !info?.configured) throw intErrors.providerDisabled();
    const key = INTEGRATION_PROVIDER_TO_KEY[provider];
    const { stored, version } = await this.config.read();
    const providers = (stored.providers as Record<string, unknown> | undefined) ?? {};
    await this.config.write({ ...stored, providers: { ...providers, [key]: { enabled } } }, version, reason, actor);
    await this.d.audit.record({ actorId: actor.id, actorRole: actor.role, action: "integration.provider-toggle", targetType: "IntegrationProvider", targetId: provider, reason, metadata: { provider, label: INTEGRATION_PROVIDER_LABELS[provider], enabled } });
    const row = (await this.listProviders()).find((p) => p.provider === provider);
    return row as AdminProviderRow;
  }

  async listConnections(q: AdminConnectionsQueryDto): Promise<{ items: AdminConnectionRow[]; total: number }> {
    const { items, total } = await this.d.integrations.listAdmin({ status: q.status, provider: q.provider, workspaceId: q.workspaceId, page: q.page, limit: q.limit });
    const [workspaces, users] = await Promise.all([this.workspaceNames(items.map((i) => i.workspaceId)), this.d.directory.getUserNames([...new Set(items.map((i) => i.createdBy))])]);
    return {
      total,
      items: items.map((i) => ({
        id: i.id,
        workspace: workspaces.get(i.workspaceId) ?? null,
        provider: i.provider,
        externalName: i.externalName,
        status: i.status,
        statusReason: i.statusReason,
        createdBy: { id: i.createdBy, name: users.get(i.createdBy) ?? null },
        lastEventAt: i.lastEventAt ? i.lastEventAt.toISOString() : null,
        updatedAt: i.updatedAt.toISOString(),
      })),
    };
  }

  /** Kết nối của MỘT workspace (tab "Tích hợp" trong drawer workspace ở admin) — chỉ đọc; tên kênh đích chỉ khi kênh công khai. */
  async listForWorkspace(workspaceId: string): Promise<Array<AdminConnectionRow & { target: { scopeType: string; name: string | null; private: boolean } }>> {
    const items = await this.d.integrations.listByWorkspace(workspaceId);
    const users = await this.d.directory.getUserNames([...new Set(items.map((i) => i.createdBy))]);
    const workspaces = await this.workspaceNames([workspaceId]);
    return Promise.all(
      items.map(async (i) => {
        const channel = i.targetScopeType === "CHANNEL" ? await this.d.directory.getChannel(i.targetScopeId) : null;
        const isPrivate = channel ? channel.visibility === "PRIVATE" : i.targetScopeType === "CONVERSATION";
        return {
          id: i.id,
          workspace: workspaces.get(workspaceId) ?? null,
          provider: i.provider,
          externalName: i.externalName,
          status: i.status,
          statusReason: i.statusReason,
          createdBy: { id: i.createdBy, name: users.get(i.createdBy) ?? null },
          lastEventAt: i.lastEventAt ? i.lastEventAt.toISOString() : null,
          updatedAt: i.updatedAt.toISOString(),
          target: { scopeType: i.targetScopeType, name: isPrivate ? null : (channel?.name ?? null), private: isPrivate },
        };
      })
    );
  }

  /** Dùng ở test/luồng khác: nhãn provider theo enum của log (`GOOGLE` ↔ `GOOGLE_CALENDAR`). */
  static providerOfEvent(provider: IntegrationEventEntity["provider"]): IntegrationProviderValue {
    return PROVIDER_OF_EVENT[provider];
  }
}

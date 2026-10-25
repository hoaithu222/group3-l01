import { INTEGRATION_EVENT_TYPES, INTEGRATION_PROVIDER_TO_KEY, type IntegrationProviderValue } from "../../../core/constants/integration";
import { ScopeNotFoundError, ValidationError, VersionConflictError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { logger } from "../../../infrastructure/logger";
import type { IntegrationConfig, IntegrationEntity } from "../entities/integration.interface";
import type { ResourcesQueryDto, UpdateIntegrationDto } from "../dtos/integration.dto";
import { intErrors } from "../integrations.errors";
import type { ResourcePage } from "../providers/provider.interface";
import { isWorkspaceAdminRole, IntegrationGuard, callProvider } from "./integration-guard";
import type { IntegrationDeps } from "./integration.deps";
import { presentIntegration, presentPublicIntegration, type IntegrationPublicView, type IntegrationView } from "./integration.presenter";

const RESOURCE_ID: Record<IntegrationProviderValue, RegExp> = {
  GITHUB: /^\d{1,20}$/,
  GITLAB: /^\d{1,20}$/,
  FIGMA: /^[A-Za-z0-9]{10,64}$/,
  GOOGLE_CALENDAR: /^$/,
};

/** Kiểm định dạng id tài nguyên theo nhà cung cấp + không trùng — id sai sẽ làm tạo hook lỗi ở nhà cung cấp. */
export function validateResources(provider: IntegrationProviderValue, repos: IntegrationConfig["repos"]): void {
  const seen = new Set<string>();
  const bad: string[] = [];
  for (const r of repos) {
    if (!RESOURCE_ID[provider].test(r.id) || seen.has(r.id)) bad.push(r.id);
    seen.add(r.id);
  }
  if (bad.length > 0) throw new ValidationError("Danh sách theo dõi không hợp lệ", { invalid: bad });
}

export interface WorkspaceIntegrationList {
  /** OWNER/ADMIN thấy đầy đủ + được quản lý; MEMBER chỉ thấy tên nhà cung cấp + kênh đích. */
  canManage: boolean;
  items: Array<IntegrationView | IntegrationPublicView>;
}

/** CRUD kết nối cấp workspace (README §5): xem, đổi cấu hình (repo/sự kiện/đích) có CAS `version`, ngắt kết nối, liệt kê tài nguyên để chọn. */
export class IntegrationService {
  private readonly guard: IntegrationGuard;

  constructor(private readonly d: IntegrationDeps) {
    this.guard = new IntegrationGuard(d);
  }

  async listForWorkspace(actor: AuthUser, workspaceId: string): Promise<WorkspaceIntegrationList> {
    const access = await this.d.access.workspaceAccess(actor.id, workspaceId);
    if (!access.visible || access.role === "GUEST") throw new ScopeNotFoundError();
    const canManage = isWorkspaceAdminRole(access.role);
    const rows = await this.d.integrations.listByWorkspace(workspaceId);
    const visible = canManage ? rows : rows.filter((r) => r.status === "ACTIVE");
    const items = await Promise.all(
      visible.map(async (r) => {
        const target = await this.d.target.describe(actor.id, workspaceId, r.targetScopeType, r.targetScopeId);
        return canManage ? presentIntegration(r, target) : presentPublicIntegration(r, target);
      })
    );
    return { canManage, items };
  }

  async get(actor: AuthUser, id: string): Promise<IntegrationView> {
    return this.view(actor, await this.guard.requireAdmin(actor, id));
  }

  async update(actor: AuthUser, id: string, dto: UpdateIntegrationDto): Promise<IntegrationView> {
    const entity = await this.guard.requireAdmin(actor, id);
    if (entity.status === "REVOKED") throw intErrors.revoked();
    if (entity.version !== dto.expectedVersion) throw new VersionConflictError(entity.version);

    const config: IntegrationConfig = { repos: dto.repos ?? entity.config.repos, events: dto.events ?? entity.config.events };
    if (dto.repos) validateResources(entity.provider, dto.repos);
    if (dto.events?.some((e) => !INTEGRATION_EVENT_TYPES[entity.provider].includes(e))) throw intErrors.unsupportedEvent({ allowed: INTEGRATION_EVENT_TYPES[entity.provider] });

    const targetChanged = dto.targetScopeType !== undefined && (dto.targetScopeType !== entity.targetScopeType || dto.targetScopeId !== entity.targetScopeId);
    if (dto.targetScopeType && dto.targetScopeId) await this.d.target.assertWritable(actor.id, entity.workspaceId, dto.targetScopeType, dto.targetScopeId);

    let externalHookIds: string[] | undefined;
    const adapter = this.d.registry.get(entity.provider);
    if (adapter?.syncHooks && (dto.repos || dto.events)) {
      const webhookKey = INTEGRATION_PROVIDER_TO_KEY[entity.provider] as "gitlab" | "figma";
      externalHookIds = await callProvider(this.d, entity, async () => {
        const ctx = await this.d.tokens.workspaceContext(entity);
        if (!ctx.webhookSecret) throw intErrors.revoked();
        return adapter.syncHooks!(ctx, { config, endpoint: this.d.webhookUrl(webhookKey), secret: ctx.webhookSecret });
      });
    }

    const reopen = targetChanged && entity.status === "ERROR" && (entity.statusReason === "TARGET_FORBIDDEN" || entity.statusReason === "TARGET_ARCHIVED");
    const updated = await this.d.integrations.updateWithVersion(id, dto.expectedVersion, {
      config,
      ...(externalHookIds ? { externalHookIds } : {}),
      ...(targetChanged ? { targetScopeType: dto.targetScopeType, targetScopeId: dto.targetScopeId, createdBy: actor.id } : {}),
      ...(reopen ? { status: "ACTIVE", statusReason: null } : {}),
    });
    if (!updated) throw new VersionConflictError((await this.d.integrations.findById(id))?.version ?? entity.version);

    await this.d.audit.record({
      actorId: actor.id,
      action: "integration.update",
      targetType: "Integration",
      targetId: id,
      workspaceId: entity.workspaceId,
      metadata: { provider: entity.provider, changed: [dto.repos && "repos", dto.events && "events", targetChanged && "target"].filter(Boolean) },
    });
    await this.d.status.emitUpdated(updated);
    return this.view(actor, updated);
  }

  /** Ngắt kết nối: dọn hook/thu hồi token phía nhà cung cấp (best-effort — lỗi chỉ log) rồi XOÁ kết nối. GitHub: người dùng gỡ ứng dụng ở GitHub để thu hồi hẳn. */
  async disconnect(actor: AuthUser, id: string): Promise<void> {
    const entity = await this.guard.requireAdmin(actor, id);
    const adapter = this.d.registry.get(entity.provider);
    if (adapter && entity.status !== "REVOKED") {
      try {
        const ctx = await this.d.tokens.workspaceContext(entity);
        await adapter.removeHooks?.(ctx);
        await adapter.revoke?.(ctx);
      } catch (err) {
        logger.warn("[integrations] Dọn hook/token phía nhà cung cấp lỗi (bỏ qua)", { integrationId: id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    await this.d.integrations.delete(id);
    await this.d.audit.record({ actorId: actor.id, action: "integration.disconnect", targetType: "Integration", targetId: id, workspaceId: entity.workspaceId, metadata: { provider: entity.provider, externalName: entity.externalName } });
    await this.d.status.emitUpdated({ ...entity, status: "REVOKED", statusReason: "DISCONNECTED" });
  }

  async listResources(actor: AuthUser, id: string, query: ResourcesQueryDto): Promise<ResourcePage> {
    const entity = await this.guard.requireAdmin(actor, id);
    if (entity.status === "REVOKED") throw intErrors.revoked();
    const adapter = this.d.registry.get(entity.provider);
    if (!adapter?.listResources) throw intErrors.unsupportedEvent({ reason: "NO_RESOURCE_LIST" });
    return callProvider(this.d, entity, async () => adapter.listResources!(await this.d.tokens.workspaceContext(entity), { query: query.query, page: query.page }));
  }

  private async view(actor: AuthUser, entity: IntegrationEntity): Promise<IntegrationView> {
    return presentIntegration(entity, await this.d.target.describe(actor.id, entity.workspaceId, entity.targetScopeType, entity.targetScopeId));
  }
}

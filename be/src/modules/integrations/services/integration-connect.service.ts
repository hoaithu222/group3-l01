import {
  INTEGRATION_EVENT_TYPES,
  INTEGRATION_KEY_TO_PROVIDER,
  INTEGRATION_PROVIDER_KIND,
  INTEGRATION_PROVIDER_TO_KEY,
  type IntegrationProviderKey,
  type IntegrationProviderValue,
} from "../../../core/constants/integration";
import { LIMITS } from "../../../core/constants/limits";
import { AppError, ForbiddenError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { logger } from "../../../infrastructure/logger";
import type { IntegrationEntity } from "../entities/integration.interface";
import { intErrors } from "../integrations.errors";
import { ProviderAuthError, ProviderUnavailableError, type StoredCredentials } from "../providers/provider.interface";
import { openCredentials, newWebhookSecret, sealCredentials, sha256Hex } from "./credential.vault";
import type { IntegrationDeps } from "./integration.deps";
import { tokenRefreshOutbox } from "./integration-jobs";
import { buildCallbackRedirect } from "./oauth-redirect";
import { newCodeVerifier, pkceChallenge, type OAuthStatePayload } from "./oauth-state.store";

export interface CallbackQuery {
  state: string;
  code?: string;
  installation_id?: string;
  setup_action?: string;
  error?: string;
}

/** Sự kiện bật mặc định khi vừa kết nối: mọi loại của nhà cung cấp trừ `note` (bình luận — ồn). */
export function defaultEvents(provider: IntegrationProviderValue): string[] {
  return INTEGRATION_EVENT_TYPES[provider].filter((e) => e !== "note");
}

export function isWorkspaceAdmin(role: string | null): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/** Mã lỗi hiện ở deep link callback (app hiện thông điệp theo mã). */
export function callbackErrorCode(err: unknown): string {
  if (err instanceof AppError) return err.errorCode;
  if (err instanceof ProviderAuthError) return "INT_003";
  if (err instanceof ProviderUnavailableError) return "INT_004";
  return "SYS_500";
}

/**
 * Kết nối GitHub/GitLab/Figma cho workspace (README §3/§5): `connect` cấp `state` một lần + URL uỷ quyền/cài đặt; `handleCallback` (route CÔNG KHAI — trình duyệt
 * hệ thống không mang JWT) tiêu thụ `state` (INT-05), xác minh người cài đặt thật sự sở hữu tài khoản ngoài, kiểm giới hạn/`INT_008`, đặt đích mặc định = kênh mặc
 * định của nhóm (người kết nối phải có quyền GHI), lưu token MÃ HOÁ, rồi 302 về deep link. Mọi lỗi → 302 `status=error&code=INT_xxx` (không tạo kết nối).
 */
export class IntegrationConnectService {
  constructor(private readonly d: IntegrationDeps) {}

  async connect(actor: AuthUser, workspaceId: string, key: IntegrationProviderKey, returnTo: "app" | "admin"): Promise<{ authorizeUrl: string }> {
    const provider = INTEGRATION_KEY_TO_PROVIDER[key];
    if (INTEGRATION_PROVIDER_KIND[provider] !== "WORKSPACE") throw intErrors.providerDisabled();
    const adapter = await this.d.availability.requireUsable(provider);
    const max = LIMITS.integration.perWorkspaceMax;
    if ((await this.d.integrations.countByWorkspace(workspaceId)) >= max) {
      // Còn kết nối hỏng của đúng nhà cung cấp này thì cho nối lại (thay hàng cũ, không thêm hàng mới).
      const reusable = (await this.d.integrations.listByWorkspace(workspaceId)).some((i) => i.provider === provider && i.status !== "ACTIVE");
      if (!reusable) throw intErrors.limitReached(max);
    }
    const codeVerifier = adapter.usesPkce ? newCodeVerifier() : undefined;
    const payload: OAuthStatePayload = { userId: actor.id, workspaceId, provider, returnTo, ...(codeVerifier ? { codeVerifier } : {}) };
    const state = await this.d.state.issue(payload);
    const authorizeUrl = adapter.authorizeUrl({ state, redirectUri: this.d.callbackUrl(key), ...(codeVerifier ? { codeChallenge: pkceChallenge(codeVerifier) } : {}) });
    return { authorizeUrl };
  }

  async handleCallback(key: IntegrationProviderKey, query: CallbackQuery): Promise<string> {
    const provider = INTEGRATION_KEY_TO_PROVIDER[key];
    const st = await this.d.state.consume(query.state);
    if (!st || st.provider !== provider || !st.workspaceId) return buildCallbackRedirect("app", { status: "error", code: "INT_003", provider: key });
    const base = { provider: key, workspaceId: st.workspaceId };
    if (query.error) return buildCallbackRedirect(st.returnTo, { status: "cancelled", ...base });
    try {
      const entity = await this.complete(st, provider, key, query);
      return buildCallbackRedirect(st.returnTo, { status: "ok", id: entity.id, ...base });
    } catch (err) {
      if (!(err instanceof AppError)) logger.warn("[integrations] Callback kết nối thất bại", { provider, error: err instanceof Error ? err.message : String(err) });
      return buildCallbackRedirect(st.returnTo, { status: "error", code: callbackErrorCode(err), ...base });
    }
  }

  private async complete(st: OAuthStatePayload, provider: IntegrationProviderValue, key: IntegrationProviderKey, query: CallbackQuery): Promise<IntegrationEntity> {
    const workspaceId = st.workspaceId as string;
    const adapter = await this.d.availability.requireUsable(provider);
    const access = await this.d.access.workspaceAccess(st.userId, workspaceId);
    if (!access.visible || !isWorkspaceAdmin(access.role)) throw new ForbiddenError();

    const result = await adapter.exchange({ code: query.code, installationId: query.installation_id, redirectUri: this.d.callbackUrl(key), codeVerifier: st.codeVerifier });

    const sameAccount = await this.d.integrations.findByExternal(provider, result.externalAccountId);
    if (sameAccount.some((i) => i.workspaceId !== workspaceId)) throw intErrors.accountTaken();
    const existing = sameAccount.find((i) => i.workspaceId === workspaceId);
    const max = LIMITS.integration.perWorkspaceMax;
    if (!existing && (await this.d.integrations.countByWorkspace(workspaceId)) >= max) throw intErrors.limitReached(max);

    const target = await this.d.target.defaultTarget(workspaceId);
    if (!target) throw intErrors.targetForbidden({ reason: "NO_DEFAULT_CHANNEL" });
    await this.d.target.assertWritable(st.userId, workspaceId, target.scopeType, target.scopeId);

    let previous: StoredCredentials | null = null;
    try {
      previous = openCredentials(existing?.credentials ?? null);
    } catch {
      previous = null; // khoá mã hoá đã đổi/dữ liệu hỏng — cấp secret mới
    }
    const webhookSecret = previous?.webhookSecret ?? (adapter.syncHooks ? newWebhookSecret() : undefined);
    const credentials: StoredCredentials | null = result.tokens
      ? { accessToken: result.tokens.accessToken, refreshToken: result.tokens.refreshToken ?? null, ...(webhookSecret ? { webhookSecret } : {}) }
      : webhookSecret
        ? { webhookSecret }
        : null;
    const expiresAt = result.tokens?.expiresAt ?? null;

    const { entity } = await this.d.integrations.upsert({
      workspaceId,
      provider,
      externalAccountId: result.externalAccountId,
      externalName: result.externalName,
      credentials: credentials ? sealCredentials(credentials) : null,
      tokenExpiresAt: expiresAt,
      scopes: result.scopes ?? result.tokens?.scopes ?? [],
      config: { repos: [], events: defaultEvents(provider) },
      targetScopeType: target.scopeType,
      targetScopeId: target.scopeId,
      webhookSecretHash: webhookSecret ? sha256Hex(webhookSecret) : null,
      createdBy: st.userId,
      outbox: expiresAt ? (id) => [tokenRefreshOutbox("WORKSPACE", id, expiresAt)] : undefined,
    });

    let finalEntity = entity;
    if (adapter.syncHooks && webhookSecret && entity.config.repos.length > 0) {
      const ctx = await this.d.tokens.workspaceContext(entity);
      const ids = await adapter.syncHooks(ctx, { config: entity.config, endpoint: this.d.webhookUrl(INTEGRATION_PROVIDER_TO_KEY[provider] as "gitlab" | "figma"), secret: webhookSecret });
      finalEntity = (await this.d.integrations.patch(entity.id, { externalHookIds: ids })) ?? entity;
    }
    await this.d.audit.record({ actorId: st.userId, action: "integration.connect", targetType: "Integration", targetId: entity.id, workspaceId, metadata: { provider, externalName: result.externalName } });
    await this.d.status.emitUpdated(finalEntity);
    return finalEntity;
  }
}

import { AppError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { IntegrationEntity, UserIntegrationEntity } from "../entities/integration.interface";
import { intErrors } from "../integrations.errors";
import { ProviderAuthError, type ProviderCallContext, type StoredCredentials, type TokenSet } from "../providers/provider.interface";
import type { ProviderRegistry } from "../providers/provider.registry";
import type { IIntegrationRepository } from "../repositories/integration.repository.interface";
import type { IUserIntegrationRepository } from "../repositories/user-integration.repository.interface";
import { openCredentials, sealCredentials } from "./credential.vault";
import type { IIntegrationJobs } from "./integration.ports";
import type { IntegrationStatusService } from "./integration-status.service";

export type RefreshOutcome = "REFRESHED" | "SKIPPED" | "REVOKED";

/** Còn ≤ chừng này thì làm mới NGAY khi dùng (job hẹn chạy sớm hơn — `tokenRefreshLeadSeconds`; đây là lưới an toàn khi job bị mất). */
const REFRESH_ON_USE_MS = 60_000;

export interface TokenDeps {
  registry: ProviderRegistry;
  integrations: IIntegrationRepository;
  userIntegrations: IUserIntegrationRepository;
  status: IntegrationStatusService;
  jobs: IIntegrationJobs;
  now?: () => Date;
}

function expiring(expiresAt: Date | null, now: Date): boolean {
  return expiresAt !== null && expiresAt.getTime() - now.getTime() <= REFRESH_ON_USE_MS;
}

/**
 * Giữ token OAuth luôn dùng được (GitLab/Figma cấp workspace, Google cấp người dùng): giải mã khi dùng, làm mới trước hạn (job `integration.token-refresh`
 * hẹn `tokenExpiresAt − 5 phút` + làm mới ngay khi dùng nếu job mất), lưu lại MÃ HOÁ. Token bị từ chối vĩnh viễn (`invalid_grant`, 401 sau refresh) → kết nối
 * `REVOKED` + thông báo, ném `INT_010`. Lỗi tạm thời (mạng/5xx) → ném nguyên để job thử lại. ❌ Không log token.
 */
export class TokenService {
  private readonly now: () => Date;

  constructor(private readonly d: TokenDeps) {
    this.now = d.now ?? (() => new Date());
  }

  /** Ngữ cảnh gọi nhà cung cấp cho kết nối workspace (GitHub App: không token — sinh installation token theo yêu cầu). */
  async workspaceContext(entity: IntegrationEntity): Promise<ProviderCallContext> {
    const base = { externalAccountId: entity.externalAccountId, externalHookIds: entity.externalHookIds };
    if (!entity.credentials) return { ...base, tokens: null };
    let creds = this.open(entity.credentials);
    if (expiring(entity.tokenExpiresAt, this.now())) creds = (await this.refreshWorkspaceCredentials(entity, creds)).credentials;
    return { ...base, tokens: this.toTokens(creds, entity.tokenExpiresAt), ...(creds.webhookSecret ? { webhookSecret: creds.webhookSecret } : {}) };
  }

  /** Token Google của người dùng (đã làm mới nếu sắp hết hạn). */
  async userTokens(entity: UserIntegrationEntity): Promise<TokenSet> {
    let creds = this.open(entity.credentials);
    let expiresAt = entity.tokenExpiresAt;
    if (expiring(entity.tokenExpiresAt, this.now())) {
      const refreshed = await this.refreshUserCredentials(entity, creds);
      creds = refreshed.credentials;
      expiresAt = refreshed.expiresAt;
    }
    return this.toTokens(creds, expiresAt);
  }

  /** Job `integration.token-refresh` (workspace). Bỏ qua khi job đã cũ (token đã sang mốc hết hạn khác) hoặc kết nối không còn ACTIVE. */
  async refreshWorkspace(id: string, expectedExpiresAtMs?: number): Promise<RefreshOutcome> {
    const entity = await this.d.integrations.findById(id);
    if (!entity || entity.status !== "ACTIVE" || !entity.credentials) return "SKIPPED";
    if (expectedExpiresAtMs !== undefined && entity.tokenExpiresAt?.getTime() !== expectedExpiresAtMs) return "SKIPPED";
    return this.guard(() => this.refreshWorkspaceCredentials(entity, this.open(entity.credentials)));
  }

  async refreshUser(id: string, expectedExpiresAtMs?: number): Promise<RefreshOutcome> {
    const entity = await this.d.userIntegrations.findById(id);
    if (!entity || entity.status !== "ACTIVE" || !entity.credentials) return "SKIPPED";
    if (expectedExpiresAtMs !== undefined && entity.tokenExpiresAt?.getTime() !== expectedExpiresAtMs) return "SKIPPED";
    return this.guard(() => this.refreshUserCredentials(entity, this.open(entity.credentials)));
  }

  private async guard(run: () => Promise<unknown>): Promise<RefreshOutcome> {
    try {
      await run();
      return "REFRESHED";
    } catch (err) {
      if (err instanceof AppError && err.errorCode === ErrorCode.INT_010) return "REVOKED";
      throw err;
    }
  }

  private open(sealed: IntegrationEntity["credentials"]): StoredCredentials {
    return openCredentials(sealed) ?? {};
  }

  private toTokens(creds: StoredCredentials, expiresAt: Date | null): TokenSet {
    if (!creds.accessToken) throw intErrors.revoked();
    return { accessToken: creds.accessToken, refreshToken: creds.refreshToken ?? null, expiresAt };
  }

  private async refreshTokens(entity: IntegrationEntity | UserIntegrationEntity, creds: StoredCredentials): Promise<TokenSet> {
    const adapter = this.d.registry.get(entity.provider);
    if (!adapter?.refresh || !creds.refreshToken || !creds.accessToken) throw new ProviderAuthError("unauthorized", "Không có refresh token");
    return adapter.refresh({ accessToken: creds.accessToken, refreshToken: creds.refreshToken });
  }

  private async refreshWorkspaceCredentials(entity: IntegrationEntity, creds: StoredCredentials): Promise<{ credentials: StoredCredentials; expiresAt: Date | null }> {
    try {
      const tokens = await this.refreshTokens(entity, creds);
      const credentials: StoredCredentials = { ...creds, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken ?? creds.refreshToken };
      const expiresAt = tokens.expiresAt ?? null;
      await this.d.integrations.saveCredentials(entity.id, sealCredentials(credentials), expiresAt);
      if (expiresAt) await this.d.jobs.scheduleTokenRefresh("WORKSPACE", entity.id, expiresAt);
      return { credentials, expiresAt };
    } catch (err) {
      if (err instanceof ProviderAuthError) {
        await this.d.status.markRevoked(entity, "TOKEN_INVALID");
        throw intErrors.revoked();
      }
      throw err;
    }
  }

  private async refreshUserCredentials(entity: UserIntegrationEntity, creds: StoredCredentials): Promise<{ credentials: StoredCredentials; expiresAt: Date | null }> {
    try {
      const tokens = await this.refreshTokens(entity, creds);
      const credentials: StoredCredentials = { ...creds, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken ?? creds.refreshToken };
      const expiresAt = tokens.expiresAt ?? null;
      await this.d.userIntegrations.saveCredentials(entity.id, sealCredentials(credentials), expiresAt);
      if (expiresAt) await this.d.jobs.scheduleTokenRefresh("USER", entity.id, expiresAt);
      return { credentials, expiresAt };
    } catch (err) {
      if (err instanceof ProviderAuthError) {
        await this.d.status.markUserRevoked(entity, "TOKEN_INVALID");
        throw intErrors.revoked();
      }
      throw err;
    }
  }
}

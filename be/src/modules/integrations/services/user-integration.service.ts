import { INTEGRATION_KEY_TO_PROVIDER, INTEGRATION_PROVIDER_KIND } from "../../../core/constants/integration";
import { AppError, NotFoundError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { logger } from "../../../infrastructure/logger";
import { intErrors } from "../integrations.errors";
import { newCodeVerifier, pkceChallenge, type OAuthStatePayload } from "./oauth-state.store";
import { sealCredentials } from "./credential.vault";
import { callbackErrorCode, type CallbackQuery } from "./integration-connect.service";
import type { IntegrationDeps } from "./integration.deps";
import { tokenRefreshOutbox } from "./integration-jobs";
import { presentUserIntegration, type UserIntegrationView } from "./integration.presenter";
import { buildCallbackRedirect } from "./oauth-redirect";
import type { CalendarSyncService } from "./calendar-sync.service";

const PROVIDER = INTEGRATION_KEY_TO_PROVIDER["google-calendar"];

/**
 * Kết nối CÁ NHÂN Google Calendar (README §2/§5): chỉ chủ tài khoản thấy/ngắt. OAuth2 + PKCE, token MÃ HOÁ, làm mới trước hạn; nối xong backfill các cuộc họp sắp
 * tới rồi mọi thay đổi họp sau đó được đẩy một chiều (`CalendarSyncService`). Ngắt kết nối: ngừng đồng bộ ngay (`DISABLED`), job dọn sự kiện tương lai rồi thu hồi token.
 */
export class UserIntegrationService {
  constructor(
    private readonly d: IntegrationDeps,
    private readonly sync: Pick<CalendarSyncService, "backfillUpcoming">
  ) {}

  async list(actor: AuthUser): Promise<UserIntegrationView[]> {
    return (await this.d.userIntegrations.listByUser(actor.id)).filter((u) => u.status !== "DISABLED").map(presentUserIntegration);
  }

  async connect(actor: AuthUser, returnTo: "app" | "admin"): Promise<{ authorizeUrl: string }> {
    if (INTEGRATION_PROVIDER_KIND[PROVIDER] !== "USER") throw intErrors.providerDisabled();
    const adapter = await this.d.availability.requireUsable(PROVIDER);
    const codeVerifier = newCodeVerifier();
    const payload: OAuthStatePayload = { userId: actor.id, provider: PROVIDER, returnTo, codeVerifier };
    const state = await this.d.state.issue(payload);
    return { authorizeUrl: adapter.authorizeUrl({ state, redirectUri: this.d.callbackUrl("google-calendar"), codeChallenge: pkceChallenge(codeVerifier) }) };
  }

  /** Route công khai: `state` một lần (INT-05) → đổi mã → lưu token mã hoá → 302 về deep link (mọi lỗi → `status=error&code=`). */
  async handleCallback(query: CallbackQuery): Promise<string> {
    const st = await this.d.state.consume(query.state);
    if (!st || st.provider !== PROVIDER) return buildCallbackRedirect("app", { status: "error", code: "INT_003", provider: "google-calendar" });
    const base = { provider: "google-calendar" };
    if (query.error) return buildCallbackRedirect(st.returnTo, { status: "cancelled", ...base });
    try {
      const adapter = await this.d.availability.requireUsable(PROVIDER);
      const result = await adapter.exchange({ code: query.code, redirectUri: this.d.callbackUrl("google-calendar"), codeVerifier: st.codeVerifier });
      if (!result.tokens) throw intErrors.stateInvalid();
      const previous = await this.d.userIntegrations.findByUserProvider(st.userId, PROVIDER);
      const expiresAt = result.tokens.expiresAt ?? null;
      const entity = await this.d.userIntegrations.upsert({
        userId: st.userId,
        provider: PROVIDER,
        externalAccountId: result.externalAccountId,
        credentials: sealCredentials({ accessToken: result.tokens.accessToken, refreshToken: result.tokens.refreshToken ?? null }),
        tokenExpiresAt: expiresAt,
        outbox: expiresAt ? (id) => [tokenRefreshOutbox("USER", id, expiresAt)] : undefined,
      });
      // Đổi sang tài khoản Google khác: sự kiện cũ nằm ở lịch khác — bỏ các liên kết để không sửa nhầm lịch mới.
      if (previous && previous.externalAccountId !== result.externalAccountId) await this.d.calendarLinks.deleteByUserIntegration(previous.id);
      await this.d.audit.record({ actorId: st.userId, action: "integration.calendar-connect", targetType: "UserIntegration", targetId: entity.id, metadata: { provider: PROVIDER } });
      await this.sync.backfillUpcoming(st.userId).catch((err: unknown) => logger.warn("[integrations] Backfill lịch lỗi (bỏ qua)", { error: err instanceof Error ? err.message : String(err) }));
      return buildCallbackRedirect(st.returnTo, { status: "ok", id: entity.id, ...base });
    } catch (err) {
      if (!(err instanceof AppError)) logger.warn("[integrations] Nối Google Calendar thất bại", { error: err instanceof Error ? err.message : String(err) });
      return buildCallbackRedirect(st.returnTo, { status: "error", code: callbackErrorCode(err), ...base });
    }
  }

  /** Ngắt kết nối (chỉ chủ): đặt `DISABLED` (ngừng đồng bộ) rồi xếp job dọn sự kiện + thu hồi token + xoá hàng. */
  async disconnect(actor: AuthUser, id: string): Promise<void> {
    const entity = await this.d.userIntegrations.findById(id);
    if (!entity || entity.userId !== actor.id) throw new NotFoundError();
    await this.d.userIntegrations.setStatus(id, "DISABLED", "DISCONNECTING");
    await this.d.audit.record({ actorId: actor.id, action: "integration.calendar-disconnect", targetType: "UserIntegration", targetId: id, metadata: { provider: entity.provider } });
    await this.d.jobs.enqueueCalendarCleanup(id);
  }
}

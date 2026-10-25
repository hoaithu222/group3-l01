import { env } from "../../../core/config";

/** Deep link app (D-14: scheme `superapp`); app xử lý ở `app/integrations/callback.tsx`. */
export const APP_CALLBACK_URL = "superapp://integrations/callback";

export interface CallbackOutcome {
  status: "ok" | "error" | "cancelled";
  /** `Integration.id` / `UserIntegration.id` khi thành công. */
  id?: string;
  /** Mã lỗi `INT_xxx` khi thất bại — app hiện thông điệp tương ứng. */
  code?: string;
  /** Khoá nhà cung cấp (`github`…) và workspace để app quay về đúng nhóm. */
  provider: string;
  workspaceId?: string;
}

/**
 * URL đích sau khi callback OAuth xong (302): app → `superapp://integrations/callback?status=…` (deep link cố định, KHÔNG nhận URL từ người dùng — chống
 * open-redirect); admin → `${FRONTEND_URL}/integration?…`. Chỉ đặt tham số theo whitelist, encode bằng `URLSearchParams`.
 */
export function buildCallbackRedirect(returnTo: "app" | "admin", outcome: CallbackOutcome): string {
  const params = new URLSearchParams({ status: outcome.status, provider: outcome.provider });
  if (outcome.id) params.set("id", outcome.id);
  if (outcome.code) params.set("code", outcome.code);
  if (outcome.workspaceId) params.set("workspaceId", outcome.workspaceId);
  const base = returnTo === "admin" ? `${env.FRONTEND_URL.replace(/\/+$/, "")}/integration` : APP_CALLBACK_URL;
  return `${base}?${params.toString()}`;
}

/** Gốc URL công khai của API (redirect_uri OAuth, URL webhook) — `INTEGRATION_OAUTH_REDIRECT_BASE`, thiếu thì `PUBLIC_API_URL`. */
export function publicApiBase(): string {
  return (env.INTEGRATION_OAUTH_REDIRECT_BASE ?? env.PUBLIC_API_URL).replace(/\/+$/, "");
}

export function oauthCallbackUrl(providerKey: string): string {
  return `${publicApiBase()}/api/v1/integrations/${providerKey}/callback`;
}

/** URL nhận webhook (`POST /api/v1/webhooks/<github|gitlab|figma|google>`) — dùng khi tạo hook GitLab/Figma. */
export function webhookEndpointUrl(webhookKey: "github" | "gitlab" | "figma" | "google"): string {
  return `${publicApiBase()}/api/v1/webhooks/${webhookKey}`;
}

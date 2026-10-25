/**
 * Liên kết sâu (deep link) của app — MỘT cửa (`@/shell/deeplink`, p0-12).
 *
 *  · `parseDeepLink(url)`     — URL → ý định có kiểu (`INVITE`, `MEETING_CODE`, `CONVERSATION`, `MESSAGE_LINK`, `CALL`) hoặc `null`.
 *  · `resolveIntentHref` / `registerIntentHandler` — ý định → `Href` của route đã có; feature ghi đè đích nếu cần.
 *  · `DeepLinkRedirect`       — thân file route chuyển tiếp (kèm thông báo trung tính khi không mở được).
 *  · `openAppLink(url)`       — bấm link của chính app trong nội dung → đi thẳng màn đích.
 *
 * Nhớ đích qua đăng nhập KHÔNG nằm ở đây: `shell/session/post-login-intent.ts` (link ngắn, TTL 30 phút) và
 * `features/members/store/pending-invite.ts` (lời mời, TTL 1 giờ) đã làm — xem `deep-link.types.ts`.
 */
export { appLinkDomain, appLinkSchemes } from './app-link-domain';
export type { DeepLinkIntent, DeepLinkIntentType, IntentOf } from './deep-link.types';
export { parseDeepLink, type ParseDeepLinkOptions } from './deep-link-parser';
export { DeepLinkRedirect } from './DeepLinkRedirect';
export { registerIntentHandler, resolveDeepLink, resolveIntentHref } from './intent-handlers';
export { openAppLink } from './open-app-link';

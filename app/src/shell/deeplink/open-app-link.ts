import { router } from 'expo-router';

import { appLinkDomain, appLinkSchemes } from './app-link-domain';
import { resolveDeepLink } from './intent-handlers';

/**
 * Bấm một liên kết TRONG app (tin nhắn, ghi chú, mô tả thẻ…): nếu là liên kết của CHÍNH app (miền `APP_LINK_DOMAIN` hoặc
 * scheme riêng) thì đi thẳng tới màn đích trong app, ngược lại trả `false` để nơi gọi mở trình duyệt như trước.
 *
 * Vì sao không cứ `Linking.openURL`: trên bản dev/khi app link chưa được hệ điều hành xác minh, link của chính ta bật ra
 * trình duyệt; và ngay cả khi xác minh rồi, vòng "app → hệ điều hành → app" làm chớp màn và mất ngữ cảnh. Chỉ nhận đúng
 * miền của app — `https://ke-xau.com/invite/x` KHÔNG bao giờ được coi là lời mời (`parseDeepLink({ hosts })`).
 *
 * `push` (không `replace`): người dùng bấm từ một màn và muốn Back về đúng màn đó. Kết quả `true` = đã điều hướng.
 */
export function openAppLink(url: string): boolean {
  const href = resolveDeepLink(url, { hosts: [appLinkDomain()], schemes: appLinkSchemes() });
  if (href === null) return false;
  router.push(href);
  return true;
}

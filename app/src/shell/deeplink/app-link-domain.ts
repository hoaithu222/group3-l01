import Constants from 'expo-constants';

/** Khớp mặc định của `APP_LINK_DOMAIN`/`APP_SCHEME` ở `app.config.ts` — dùng khi không đọc được cấu hình runtime. */
const DEFAULT_LINK_DOMAIN = 'superapp.vcijsc.com';
const DEFAULT_SCHEME = 'superapp';

/**
 * Miền universal/app link (D-14) — đọc từ `ios.associatedDomains` mà `app.config.ts` sinh từ `APP_LINK_DOMAIN`, cùng nguồn
 * với `linkDomain()` của `features/meetings/utils/meeting-link.ts` (không import feature ở đây: shell chỉ cần đọc cấu hình).
 */
export function appLinkDomain(): string {
  const applink = Constants.expoConfig?.ios?.associatedDomains?.find((d) =>
    d.startsWith('applinks:'),
  );
  return applink ? applink.slice('applinks:'.length) : DEFAULT_LINK_DOMAIN;
}

/** Scheme riêng của app (`superapp://…`) — `expo.scheme` (chuỗi hoặc mảng). */
export function appLinkSchemes(): string[] {
  const scheme = Constants.expoConfig?.scheme;
  const list = Array.isArray(scheme) ? scheme : scheme ? [scheme] : [];
  return list.length > 0 ? list : [DEFAULT_SCHEME];
}

import Constants from 'expo-constants';

/** Khớp mặc định của `APP_LINK_DOMAIN` ở `app.config.ts` — dùng khi không đọc được cấu hình runtime. */
const DEFAULT_LINK_DOMAIN = 'superapp.vcijsc.com';

/**
 * Miền universal link thật đang cấu hình (`ios.associatedDomains: ['applinks:<miền>']` do
 * `app.config.ts` sinh từ `APP_LINK_DOMAIN`) — đọc từ đó thay vì chép hằng số, để đổi miền ở `.env`
 * thì link sao chép theo (app không có biến môi trường `EXPO_PUBLIC_*` cho miền này).
 */
export function appLinkDomain(): string {
  const domains = Constants.expoConfig?.ios?.associatedDomains;
  const applink = domains?.find((domain) => domain.startsWith('applinks:'));
  return applink ? applink.slice('applinks:'.length) : DEFAULT_LINK_DOMAIN;
}

/** `https://<miền>/w/{wsId}/t/{taskId}` — deep link p3-03 (app.md §1), có route `app/w/[wsId]/t/[taskId].tsx`. */
export function taskLink(wsId: string, taskId: string): string {
  return `https://${appLinkDomain()}/w/${wsId}/t/${taskId}`;
}

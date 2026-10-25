import Constants from 'expo-constants';

/** Khớp mặc định của `APP_LINK_DOMAIN` ở `app.config.ts` — dùng khi không đọc được cấu hình runtime. */
const DEFAULT_LINK_DOMAIN = 'superapp.vcijsc.com';

/** Miền universal link đang cấu hình (`ios.associatedDomains` do `app.config.ts` sinh từ `APP_LINK_DOMAIN`). */
function linkDomain(): string {
  const applink = Constants.expoConfig?.ios?.associatedDomains?.find((domain) => domain.startsWith('applinks:'));
  return applink ? applink.slice('applinks:'.length) : DEFAULT_LINK_DOMAIN;
}

/**
 * Nội dung chia sẻ khi bấm "Mời người khác" trong phòng: tên họp, mã họp và link `https://<miền>/m/<mã>` (mở app qua universal link).
 * Viết lại vài dòng thay vì import `meetingShareUrl` của feature `meetings` (không import chéo feature) — hai nơi cùng khuôn với
 * `MeetingShareRow` của p2-04. Chưa có mã (chi tiết chưa tải) → chỉ tên họp.
 */
export function meetingInviteMessage(title: string, code: string | undefined): string {
  if (!code) return title;
  return `${title}\nMã họp: ${code}\nhttps://${linkDomain()}/m/${code}`;
}

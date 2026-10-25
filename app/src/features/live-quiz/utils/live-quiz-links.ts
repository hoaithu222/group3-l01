import Constants from 'expo-constants';

/** Độ dài PIN (BE `joinSchema`: `^\d{6}$`). */
export const PIN_LENGTH = 6;

/** Chuẩn hoá thứ người dùng dán/gõ hoặc `?pin=` của deep link: chỉ giữ chữ số, tối đa 6. */
export function cleanPin(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
  return raw.replace(/\D/g, '').slice(0, PIN_LENGTH);
}

/**
 * PIN trong một đường dẫn/URL vào phòng thi: `superapp://live/123456`, `https://<miền>/live/123456?x=1`, `/live/123456`.
 * Đủ 6 chữ số mới hợp lệ (5 hay 7 số ⇒ `null`) — không đoán, để màn tham gia không điền sẵn một mã sai.
 */
export function pinFromLink(url: string): string | null {
  const match = /(?:^|\/)live\/(\d{6})(?:[/?#]|$)/.exec(url.trim());
  return match?.[1] ?? null;
}

/**
 * Deep link mở thẳng màn tham gia: `<scheme>://live/{pin}` (app.md p5-01 §1). Scheme đọc từ cấu hình build
 * (`APP_SCHEME` ở `app.config.ts`), mặc định `superapp`. ⚠️ Chỉ có link scheme: link `https://<miền>/live/{pin}` cần thêm
 * `pathPrefix: '/live/'` vào `intentFilters` + AASA ở `app.config.ts`/BE (p0-12) — chưa có thì link https mở trình duyệt.
 */
export function liveDeepLink(pin: string): string {
  const scheme = Constants.expoConfig?.scheme;
  const name = (Array.isArray(scheme) ? scheme[0] : scheme) || 'superapp';
  return `${name}://live/${pin}`;
}

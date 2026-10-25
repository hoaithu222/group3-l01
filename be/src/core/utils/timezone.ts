/** `true` khi `tz` là múi giờ IANA hợp lệ (vd `Asia/Ho_Chi_Minh`) — kiểm bằng `Intl`, không cần danh sách tay. */
export function isValidIanaTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

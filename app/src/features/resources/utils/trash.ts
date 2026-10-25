const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Số ngày còn lại trước khi bị xoá vĩnh viễn, tính từ `purgeAt` MÀ BE TRẢ (BE đã cộng số
 * ngày giữ thùng rác hiệu lực, admin chỉnh được 7–90) — client KHÔNG tự cộng
 * `deletedAt + retentionDays` bằng cấu hình cục bộ, vì cấu hình đó có thể lệch với BE.
 *
 * Làm tròn LÊN: còn 2,1 ngày hiện "2 ngày" chứ không phải "còn 2 ngày" rồi
 * đột ngột 0 — và không bao giờ âm (đã quá hạn, chờ cron 03:15 dọn) ⇒ 0.
 */
export function trashDaysLeft(
  purgeAt: string | null | undefined,
  now: number = Date.now(),
): number | null {
  if (!purgeAt) return null;
  const purge = Date.parse(purgeAt);
  if (Number.isNaN(purge)) return null;
  return Math.max(0, Math.ceil((purge - now) / DAY_MS));
}

export function trashDaysLabel(daysLeft: number | null): string {
  if (daysLeft === null) return '';
  if (daysLeft <= 0) return 'Sắp bị xoá vĩnh viễn';
  return `Còn ${daysLeft} ngày`;
}

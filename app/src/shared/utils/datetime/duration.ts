/**
 * Độ dài theo GIÂY → chữ đồng hồ: `3725` → `"1:02:05"`, `65` → `"1:05"`, `5` → `"0:05"`.
 *
 * Dùng cho thời lượng cuộc gọi/ghi âm/video/cuộc họp. Không phải "còn bao lâu" theo lịch (đó là `formatRelative`).
 * Số âm, `NaN`, `Infinity` ⇒ `"0:00"` (đồng hồ hỏng không được hiện "NaN:NaN"). Phần thập phân bị cắt (không làm tròn
 * lên — "0:59.9" không được thành "1:00" trước khi thật sự tròn phút).
 */
export function formatDuration(totalSeconds: number): string {
  const seconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const ss = String(rest).padStart(2, '0');

  if (hours > 0) return `${String(hours)}:${String(minutes).padStart(2, '0')}:${ss}`;
  return `${String(minutes)}:${ss}`;
}

/**
 * Đồng hồ phòng họp — hàm THUẦN (không React, không `Date.now()` ngầm) để test được mà không cần fake timer. "Bây giờ" LUÔN do nơi gọi
 * truyền vào và tính theo GIỜ SERVER (`Date.now() + serverOffsetMs`, `hooks/useMeetingClock.ts`) — hai máy lệch đồng hồ vẫn thấy cùng khoảnh khắc.
 */

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** `mm:ss`; từ một giờ trở lên `h:mm:ss`. Số âm/NaN → `00:00`. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}:${pad2(minutes)}:${pad2(seconds % 60)}` : `${pad2(minutes)}:${pad2(seconds % 60)}`;
}

/** Số giây đã trôi qua từ `startedAtIso` tới `serverNowMs`; chưa có mốc/mốc hỏng → 0 (không bao giờ âm). */
export function elapsedSeconds(startedAtIso: string | null | undefined, serverNowMs: number): number {
  const started = startedAtIso ? Date.parse(startedAtIso) : Number.NaN;
  return Number.isFinite(started) ? Math.max(0, Math.floor((serverNowMs - started) / 1000)) : 0;
}

/** Còn bao nhiêu ms tới `targetIso` (không âm); mốc hỏng → 0. */
export function remainingMs(targetIso: string | null | undefined, serverNowMs: number): number {
  const target = targetIso ? Date.parse(targetIso) : Number.NaN;
  return Number.isFinite(target) ? Math.max(0, target - serverNowMs) : 0;
}

/** Số phút làm tròn LÊN tới `closingAtIso` (cảnh báo "tự kết thúc sau N phút"); đã quá hạn → 0. */
export function minutesUntil(closingAtIso: string | null | undefined, serverNowMs: number): number {
  return Math.ceil(remainingMs(closingAtIso, serverNowMs) / 60_000);
}

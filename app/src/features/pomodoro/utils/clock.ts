import type { PomodoroSnapshot } from '../api/pomodoro.types';

/**
 * Đồng hồ theo SERVER (app.md p5-02 §4): `offset = serverNow − Date.now()` đo lúc nhận MỖI snapshot; hiển thị = `phaseEndsAt − (now + offset)`.
 * ⛔ Không đếm giờ bằng đồng hồ máy thuần — hai máy lệch nhau vài phút vẫn phải đếm ngược cùng nhịp (PM-01) — và ⛔ không bao giờ tự chuyển phase
 * ở client: chạm 0 thì hiện "00:00" rồi chờ `pomodoro:updated`.
 */
export const OFFSET_SAMPLE_COUNT = 5;

export function clockOffset(serverNow: string, localNowMs: number = Date.now()): number {
  const server = Date.parse(serverNow);
  return Number.isNaN(server) ? 0 : server - localNowMs;
}

/** Trung vị (không phải trung bình): một gói tới chậm bất thường không kéo lệch cả đồng hồ. */
export function medianOffset(samples: readonly number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] ?? 0;
  const lower = sorted[mid - 1] ?? upper;
  return sorted.length % 2 === 1 ? upper : Math.round((lower + upper) / 2);
}

/** Thêm mẫu, giữ `OFFSET_SAMPLE_COUNT` mẫu gần nhất. */
export function pushSample(samples: readonly number[], value: number): number[] {
  return [...samples, value].slice(-OFFSET_SAMPLE_COUNT);
}

type ClockFields = Pick<PomodoroSnapshot, 'phase' | 'phaseEndsAt' | 'remainingMs'>;

/** Còn lại của phase (ms): PAUSED dùng `remainingMs` đã lưu (đóng băng), đang chạy tính theo đồng hồ server, còn lại `null`. */
export function remainingMsAt(s: ClockFields, offsetMs: number, nowMs: number = Date.now()): number | null {
  if (s.phase === 'PAUSED') return s.remainingMs;
  if (!s.phaseEndsAt) return null;
  const endsAt = Date.parse(s.phaseEndsAt);
  return Number.isNaN(endsAt) ? null : Math.max(0, endsAt - (nowMs + offsetMs));
}

/** `MM:SS` làm tròn LÊN theo giây (đếm ngược: còn 24:59,2 vẫn hiện 25:00 tới khi trôi đủ 1 giây, `0` mới ra 00:00). */
export function formatClock(ms: number | null): string {
  if (ms === null) return '--:--';
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Nhãn trình đọc màn hình: làm tròn LÊN theo PHÚT — nhãn chỉ đổi mỗi phút (app.md p5-02 §7: "không cập nhật mỗi giây"), và
 * vẫn đúng ở mọi lúc được đọc (không kẹt ở "12 phút 30 giây" khi đã trôi tới 11 phút 45 giây).
 */
export function clockA11yLabel(ms: number | null, phaseLabel: string): string {
  if (ms === null) return `Giai đoạn ${phaseLabel}`;
  if (ms <= 0) return `Hết giờ, giai đoạn ${phaseLabel}`;
  const minutes = Math.ceil(ms / 60_000);
  return `Còn khoảng ${minutes} phút, giai đoạn ${phaseLabel}`;
}

/** Phần đã trôi của phase (0..1) — vòng tiến độ. */
export function elapsedRatio(remaining: number | null, total: number | null): number {
  if (remaining === null || total === null || total <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - remaining / total));
}

/** "1 giờ 25 phút" · "12 phút" · "45 giây" — thời gian có mặt/khoảng phiên (không dùng `toLocaleString`). */
export function formatSpan(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds} giây`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} giờ` : `${hours} giờ ${rest} phút`;
}

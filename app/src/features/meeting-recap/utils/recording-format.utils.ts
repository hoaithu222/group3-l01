import type { RecordingDto, RecordingStatus } from '../api/meeting-recap.types';

/** Nhãn trạng thái bằng CHỮ (app.md §3 `RecordingStatusBadge`) — không chỉ màu. */
export const RECORDING_STATUS_LABEL: Record<RecordingStatus, string> = {
  FAILED: 'Lỗi',
  PROCESSING: 'Đang xử lý',
  READY: 'Sẵn sàng',
  RECORDING: 'Đang ghi',
  STARTING: 'Đang bắt đầu',
  STOPPING: 'Đang dừng',
};

export type RecordingTone = 'error' | 'info' | 'success' | 'warning';

export const RECORDING_STATUS_TONE: Record<RecordingStatus, RecordingTone> = {
  FAILED: 'error',
  PROCESSING: 'info',
  READY: 'success',
  RECORDING: 'warning',
  STARTING: 'warning',
  STOPPING: 'info',
};

/** "45 phút", "1 giờ 05 phút", "dưới 1 phút" — nói, không phải đồng hồ. `undefined`/âm → chuỗi rỗng. */
export function spokenDuration(totalSeconds: number | undefined): string {
  if (totalSeconds === undefined || !Number.isFinite(totalSeconds) || totalSeconds < 0) return '';
  if (totalSeconds < 60) return 'dưới 1 phút';
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${String(minutes)} phút`;
  const rest = minutes % 60;
  const hours = String(Math.floor(minutes / 60));
  return rest === 0 ? `${hours} giờ` : `${hours} giờ ${String(rest).padStart(2, '0')} phút`;
}

const DAY_MS = 86_400_000;

/**
 * "Tự xoá sau 23 ngày" / "Tự xoá trong hôm nay" (app.md §3 `RetentionNote`). `nowMs` là GIỜ SERVER do nơi gọi giữ trong state (React
 * Compiler: không đọc `Date.now()` trong render). Không có hạn (chưa READY) → `null`.
 */
export function retentionNote(expiresAt: string | undefined, nowMs: number): string | null {
  if (!expiresAt) return null;
  const at = new Date(expiresAt).getTime();
  if (!Number.isFinite(at)) return null;
  const days = Math.ceil((at - nowMs) / DAY_MS);
  return days <= 1 ? 'Tự xoá trong hôm nay' : `Tự xoá sau ${String(days)} ngày`;
}

/** Người xem thường chỉ thấy READY (BE đã lọc); người điều khiển thấy thêm bản đang xử lý/lỗi — không phát được. */
export const isPlayable = (rec: Pick<RecordingDto, 'status'>): boolean => rec.status === 'READY';

import { isAxiosError } from 'axios';

import {
  extractErrorCode,
  extractErrorDetails,
  extractRetryAfterSeconds,
} from '@/core/api/error.handler';

import { PICKUP_ERROR } from '../constants/partner.constants';

/** Kết quả PHÂN LOẠI một lỗi giao hàng bằng PIN — hộp thoại chọn cách hiện theo `kind` thay vì toast chung. */
export type PickupFailure =
  /** `O2O_007` (400): sai PIN. `attemptsLeft` từ `details` (`null` nếu BE không kèm). */
  | { kind: 'wrong-pin'; attemptsLeft: number | null }
  /** `O2O_008` (423): khoá vì nhập sai quá số lần — đếm ngược `retryAfterSeconds`. */
  | { kind: 'locked'; retryAfterSeconds: number }
  /** 429: chặn dò PIN xuyên đơn theo tài khoản tiệm (30 lần/15 phút) — `Retry-After` nếu đọc được. */
  | { kind: 'rate-limited'; retryAfterSeconds: number | null }
  /** `O2O_004` (409): đơn vừa đổi trạng thái ở nơi khác (khách huỷ, hết hạn…). */
  | { kind: 'state' }
  | { kind: 'other' };

/** Đọc một trường SỐ từ `details` (kiểu `unknown` từ BE) mà không tin mù vào hình dạng của nó. */
function numberField(details: unknown, key: string): number | null {
  if (typeof details !== 'object' || details === null) return null;
  const value = (details as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Phân loại lỗi của `POST /partner/orders/:id/pickup` (be.md §4: `O2O_007` kèm `attemptsLeft`, `O2O_008` 423 kèm `retryAfterSeconds`). */
export function classifyPickupError(err: unknown): PickupFailure {
  if (!isAxiosError(err)) return { kind: 'other' };
  if (err.response?.status === 429) {
    return { kind: 'rate-limited', retryAfterSeconds: extractRetryAfterSeconds(err) };
  }
  const code = extractErrorCode(err);
  const details = extractErrorDetails(err);
  if (code === PICKUP_ERROR.wrongPin) {
    return { kind: 'wrong-pin', attemptsLeft: numberField(details, 'attemptsLeft') };
  }
  if (code === PICKUP_ERROR.locked) {
    // Thiếu `retryAfterSeconds` (không nên xảy ra) → coi như khoá đủ lâu để không cho bấm liên tục: dùng header, rồi mới tới 60 giây.
    const seconds =
      numberField(details, 'retryAfterSeconds') ?? extractRetryAfterSeconds(err) ?? 60;
    return { kind: 'locked', retryAfterSeconds: Math.max(1, Math.ceil(seconds)) };
  }
  if (code === PICKUP_ERROR.invalidState) return { kind: 'state' };
  return { kind: 'other' };
}

/** 905 giây → "15:05" (phút:giây) cho đếm ngược khoá PIN. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

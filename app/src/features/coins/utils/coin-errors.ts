import { isAxiosError } from 'axios';

import { toErrorMessage } from '@/core/api/client.helpers';
import type { ApiErrorBody } from '@/core/api/client.types';

import { formatCoins } from './coin-format';

/**
 * Câu tiếng Việt cho mã `COIN_*` (be.md p7-02 §8; `be/src/core/utils/error.codes.ts`) — đặt TRONG feature, cùng cách `career/utils/recruiter-errors.ts`
 * (bảng chung `shared/constants/error-codes.ts` đang kịch trần dòng). `COIN_006..008` là của chợ tài liệu (P1) — chưa cấp phát ở BE nên chưa khai.
 */
export const COIN_ERROR_MESSAGES: Record<string, string> = {
  COIN_001: 'Bạn không đủ xu',
  COIN_002: 'Bạn đã sở hữu vật phẩm này',
  COIN_003: 'Vật phẩm không còn được bán',
  COIN_004: 'Phần thưởng nhiệm vụ này đã được nhận',
  COIN_005: 'Nhiệm vụ chưa hoàn thành',
  COIN_009: 'Số dư xu vượt mức tối đa cho phép',
};

function bodyOf(error: unknown): ApiErrorBody | undefined {
  return isAxiosError(error) ? (error.response?.data as ApiErrorBody | undefined) : undefined;
}

/** Mã lỗi BE (`COIN_001`…) — chỗ UI RẼ NHÁNH theo mã. */
export function coinErrorCode(error: unknown): string | null {
  return bodyOf(error)?.error?.code ?? null;
}

export interface Shortfall {
  balance: number;
  required: number;
  /** Số xu còn thiếu (`required − balance`, ≥ 1). */
  missing: number;
}

/** `COIN_001` kèm `details { balance, required }` ⇒ "còn thiếu N xu". Thiếu/hỏng `details` ⇒ `null` (rơi về câu chung). */
export function shortfallOf(error: unknown): Shortfall | null {
  if (coinErrorCode(error) !== 'COIN_001') return null;
  const details = bodyOf(error)?.error?.details;
  if (!details || typeof details !== 'object') return null;
  const { balance, required } = details as { balance?: unknown; required?: unknown };
  if (typeof balance !== 'number' || typeof required !== 'number') return null;
  return { balance, required, missing: Math.max(1, required - balance) };
}

/** Câu cho người dùng: ưu tiên nhãn `COIN_*` của feature (`COIN_001` nói rõ số còn thiếu), còn lại dùng bộ dịch chung (mạng, 5xx, 429…). */
export function coinErrorMessage(error: unknown): string {
  const shortfall = shortfallOf(error);
  if (shortfall) return `Bạn còn thiếu ${formatCoins(shortfall.missing)}`;
  const code = coinErrorCode(error);
  return (code && COIN_ERROR_MESSAGES[code]) || toErrorMessage(error);
}

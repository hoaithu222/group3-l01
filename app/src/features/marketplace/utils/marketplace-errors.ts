import { isAxiosError } from 'axios';

import { toErrorMessage } from '@/core/api/client.helpers';
import type { ApiErrorBody } from '@/core/api/client.types';

/**
 * Câu tiếng Việt cho mã lỗi chợ tài liệu (`COIN_00[1268]`, `COIN_009`, `RES_002/003`; be.md p7-02 §8) — đặt TRONG feature, cùng cách
 * `features/coins/utils/coin-errors.ts`. `COIN_003/004/005` (cửa hàng/nhiệm vụ) không xuất hiện ở đây — feature khác.
 */
export const MARKETPLACE_ERROR_MESSAGES: Record<string, string> = {
  COIN_001: 'Bạn không đủ xu',
  COIN_002: 'Bạn đã mua tài liệu này',
  COIN_006: 'Nội dung này không thể niêm yết hoặc không thể mua',
  COIN_007: 'Bạn đã đạt số tin niêm yết tối đa',
  COIN_008: 'Chợ tài liệu chưa mở',
  COIN_009: 'Số dư xu vượt mức tối đa cho phép',
  RES_002: 'Nội dung này đã có tin niêm yết khác',
  RES_003: 'Tin niêm yết đã thay đổi, vui lòng tải lại',
};

function bodyOf(error: unknown): ApiErrorBody | undefined {
  return isAxiosError(error) ? (error.response?.data as ApiErrorBody | undefined) : undefined;
}

export function marketplaceErrorCode(error: unknown): string | null {
  return bodyOf(error)?.error?.code ?? null;
}

export interface Shortfall {
  balance: number;
  required: number;
  missing: number;
}

/** `COIN_001` kèm `details { balance, required }` ⇒ "còn thiếu N xu". */
export function shortfallOf(error: unknown): Shortfall | null {
  if (marketplaceErrorCode(error) !== 'COIN_001') return null;
  const details = bodyOf(error)?.error?.details;
  if (!details || typeof details !== 'object') return null;
  const { balance, required } = details as { balance?: unknown; required?: unknown };
  if (typeof balance !== 'number' || typeof required !== 'number') return null;
  return { balance, required, missing: Math.max(1, required - balance) };
}

export function marketplaceErrorMessage(error: unknown): string {
  const shortfall = shortfallOf(error);
  if (shortfall) return `Bạn còn thiếu ${String(shortfall.missing)} xu`;
  const code = marketplaceErrorCode(error);
  return (code && MARKETPLACE_ERROR_MESSAGES[code]) || toErrorMessage(error);
}

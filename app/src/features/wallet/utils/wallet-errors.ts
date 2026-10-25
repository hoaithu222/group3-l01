import { isAxiosError } from 'axios';

import { WALLET_ERROR } from '../constants/wallet.constants';

/**
 * Đọc lỗi API của ví — chỗ UI RẼ NHÁNH theo mã (không chỉ hiện câu chữ).
 * Câu tiếng Việt cho từng mã nằm ở `shared/constants/wallet-error-codes.constants.ts`.
 */

interface WalletErrorBody {
  error?: { code?: string; details?: Record<string, unknown> };
}

function bodyOf(error: unknown): WalletErrorBody | undefined {
  return isAxiosError(error) ? (error.response?.data as WalletErrorBody | undefined) : undefined;
}

export function walletErrorCode(error: unknown): string | null {
  return bodyOf(error)?.error?.code ?? null;
}

export function httpStatusOf(error: unknown): number | null {
  return isAxiosError(error) ? (error.response?.status ?? null) : null;
}

/** 404 (GUEST/không phải thành viên/cờ `wallet` tắt → `CFG_005`) — màn hiện "không xem được". */
export function isWalletDenied(error: unknown): boolean {
  return httpStatusOf(error) === 404 || walletErrorCode(error) === 'CFG_005';
}

/** `WALLET_004` (409): khoản đã có người thanh toán → chỉ còn "Tạo khoản điều chỉnh". */
export function isExpenseLocked(error: unknown): boolean {
  return walletErrorCode(error) === WALLET_ERROR.expenseLocked;
}

/** `WALLET_001` kèm `details.invalidUserIds` — người không thuộc nhóm, để đánh dấu ở SplitEditor. */
export function invalidUserIdsOf(error: unknown): string[] {
  if (walletErrorCode(error) !== WALLET_ERROR.invalidParticipant) return [];
  const ids = bodyOf(error)?.error?.details?.invalidUserIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}

/**
 * Số giây chờ khi bị 429 (`WALLET_010`): `details.retryAfter` hoặc header
 * `Retry-After`. `null` khi BE không cho biết — UI hiện câu chung, không đoán số.
 */
export function retryAfterSeconds(error: unknown): number | null {
  if (!isAxiosError(error)) return null;
  const fromBody = bodyOf(error)?.error?.details?.retryAfter;
  const fromHeader = error.response?.headers?.['retry-after'];
  const value = Number(fromBody ?? fromHeader);
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : null;
}

/** 409 xung đột phiên bản (`expectedVersion` cũ) — KHÁC `WALLET_004`/`WALLET_007` cũng là 409 nhưng có nghĩa riêng. */
export function isVersionConflict(error: unknown): boolean {
  if (httpStatusOf(error) !== 409) return false;
  const code = walletErrorCode(error);
  return code !== WALLET_ERROR.expenseLocked && code !== WALLET_ERROR.settlementNotPending;
}

/** Lỗi 4xx DỨT KHOÁT (BE đã chốt câu trả lời) — khác lỗi mạng/5xx có thể thử lại cùng khoá idempotency. */
export function isDefinitiveRejection(error: unknown): boolean {
  const status = httpStatusOf(error);
  return status !== null && status >= 400 && status < 500;
}

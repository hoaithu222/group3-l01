import type { AxiosError } from 'axios';

import { extractErrorCode, extractErrorDetails } from '@/core/api/error.handler';

/** Mã lỗi có giao diện riêng trong trang — KHÔNG toast chung. */
export const INLINE_CONFIG_ERRORS: ReadonlySet<string> = new Set(['RES_003', 'CFG_002']);

export const configErrorCode = (err: unknown): string => extractErrorCode(err as AxiosError);

/** `details` của `CFG_002`: `{ path, floor?, ceil? }`. */
export interface OutOfRangeDetails {
  path: string;
  floor?: number;
  ceil?: number;
}

export function outOfRangeDetails(err: unknown): OutOfRangeDetails | null {
  const details = extractErrorDetails(err as AxiosError) as Partial<OutOfRangeDetails> | null;
  return details && typeof details.path === 'string' ? (details as OutOfRangeDetails) : null;
}

/** `CFG_003.details.reason`: `missing-env` (thiếu LiveKit…) hay `not-available` (chưa có mã). */
export function featureBlockReason(err: unknown): 'missing-env' | 'not-available' | null {
  const details = extractErrorDetails(err as AxiosError) as { reason?: string } | null;
  if (details?.reason === 'missing-env' || details?.reason === 'not-available')
    return details.reason;
  return null;
}

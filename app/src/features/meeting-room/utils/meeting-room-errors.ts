import { isAxiosError } from 'axios';

import { toErrorMessage } from '@/core/api/client.helpers';

import type { BlockedCode } from '../api/meeting-room.types';

/**
 * Phân loại lỗi luồng vào phòng (BE `MEET_*`, `CALL_004`, `RES_003`, `MEDIA_*`). Mỗi loại một HƯỚNG xử lý khác nhau — không loại nào là
 * "toast lỗi": BLOCKED → màn `JoinBlockedView` (thông điệp trung tính), BUSY → hộp thoại chuyển cuộc gọi, VERSION → tải lại rồi thử lại,
 * OFFLINE/ERROR → `Alert` + "Thử lại" ngay trên pre-join (app.md §3.2).
 */
type JoinFailure =
  | { code: BlockedCode; kind: 'BLOCKED' }
  | { kind: 'BUSY'; sameDevice: boolean }
  | { kind: 'ERROR'; message: string }
  | { kind: 'FORBIDDEN'; message: string }
  | { kind: 'OFFLINE' }
  | { kind: 'VERSION' };

const BLOCKING_CODES: ReadonlySet<string> = new Set(['MEET_006', 'MEET_007', 'MEET_009', 'MEET_010', 'MEET_012', 'MEET_013', 'MEET_017', 'MEET_018']);

export const OFFLINE_MESSAGE = 'Cần kết nối mạng để tham gia cuộc họp.';

interface ErrorBody {
  error?: { code?: string; details?: { sameCallOtherDevice?: boolean } };
}

export function classifyJoinError(error: unknown): JoinFailure {
  if (!isAxiosError(error)) return { kind: 'ERROR', message: toErrorMessage(error) };
  if (!error.response) return { kind: 'OFFLINE' };

  const body = error.response.data as ErrorBody | undefined;
  const code = body?.error?.code ?? '';
  const status = error.response.status;

  if (BLOCKING_CODES.has(code)) return { code: code as BlockedCode, kind: 'BLOCKED' };
  if (code === 'CALL_004') return { kind: 'BUSY', sameDevice: body?.error?.details?.sameCallOtherDevice === true };
  if (code === 'RES_003') return { kind: 'VERSION' };
  if (code === 'MEET_001' || code === 'CFG_005' || status === 404) return { code: 'GONE', kind: 'BLOCKED' };
  if (code === 'MEET_002' || status === 403) {
    return { kind: 'FORBIDDEN', message: 'Chỉ chủ trì hoặc đồng chủ trì được thực hiện thao tác này.' };
  }
  return { kind: 'ERROR', message: toErrorMessage(error) };
}

/** Lỗi của thao tác chủ trì trong phòng (toast): 404 `MEET_020` = "người này đã rời phòng", còn lại theo `toErrorMessage`. */
export function hostActionMessage(error: unknown): string {
  if (isAxiosError(error) && error.response) {
    const code = (error.response.data as ErrorBody | undefined)?.error?.code;
    if (code === 'MEET_020') return 'Người này không còn trong phòng họp.';
    if (code === 'MEET_019') return 'Không thể thực hiện thao tác này với chủ trì.';
    if (code === 'MEET_009') return 'Cuộc họp không còn diễn ra.';
    if (code === 'MEET_002') return 'Chỉ chủ trì hoặc đồng chủ trì được thực hiện thao tác này.';
  }
  return toErrorMessage(error);
}

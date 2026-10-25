import { isAxiosError } from 'axios';

import { describeSearchError } from '@/shared/search';

import { WORKSPACE_SEARCH_ERROR_MESSAGES } from '../constants/workspace-search.constants';

export type WorkspaceSearchErrorKind =
  /** 404 `CFG_005` — cờ phụ `workspaceSearch` bị tắt lúc đang mở màn. */
  | 'feature-off'
  /** 403 `SRCH_103` — khách tìm danh sách người. */
  | 'forbidden'
  /** Mất mạng — "Cần kết nối để tìm". */
  | 'offline'
  | 'other'
  /** 429 `RATE_002` — đếm ngược rồi tự thử lại. */
  | 'rate-limited'
  /** 404 `SRCH_102` — kênh/hội thoại đang lọc không còn đọc được: bỏ lọc phạm vi, KHÔNG rời nhóm. */
  | 'scope-gone'
  /** 422 `SRCH_104` — quá rộng, hết `maxTimeMs` mà chưa có kết quả nào: thêm bộ lọc. */
  | 'too-broad'
  /** Các 404 còn lại (`PERM_404`/`RES_001`) — mất quyền vào nhóm: rời màn về danh sách nhóm. */
  | 'workspace-gone';

export interface WorkspaceSearchError {
  code?: string;
  kind: WorkspaceSearchErrorKind;
  message: string;
  /** Chỉ có khi `kind === 'rate-limited'`. */
  retryAfterSeconds?: number;
}

export const OFFLINE_MESSAGE = 'Cần kết nối để tìm';
const WORKSPACE_GONE_MESSAGE = 'Bạn không còn quyền xem nhóm này.';

/**
 * Lỗi của lượt tìm → trạng thái hiển thị (app.md p5-04 §3). Dựng trên `describeSearchError` dùng chung (404/429/khác) nhưng
 * tách 404 làm ba theo MÃ: `CFG_005` (tính năng tắt) và `SRCH_102` (phạm vi mất) KHÔNG được đá người dùng ra khỏi nhóm —
 * chỉ các 404 còn lại (mất quyền vào nhóm) mới về danh sách nhóm.
 */
export function describeWorkspaceSearchError(error: unknown): WorkspaceSearchError {
  const base = describeSearchError(error);
  const { code } = base;
  const known = code ? WORKSPACE_SEARCH_ERROR_MESSAGES[code] : undefined;
  const meta = code ? { code } : {};

  if (base.kind === 'rate-limited') {
    return {
      ...meta,
      kind: 'rate-limited',
      message: base.message,
      retryAfterSeconds: base.retryAfterSeconds ?? 10,
    };
  }
  if (code === 'CFG_005') return { ...meta, kind: 'feature-off', message: known ?? base.message };
  if (code === 'SRCH_102') return { ...meta, kind: 'scope-gone', message: known ?? base.message };
  if (base.kind === 'no-access')
    return { ...meta, kind: 'workspace-gone', message: WORKSPACE_GONE_MESSAGE };
  if (code === 'SRCH_104') return { ...meta, kind: 'too-broad', message: known ?? base.message };
  if (code === 'SRCH_103') return { ...meta, kind: 'forbidden', message: known ?? base.message };
  if (isAxiosError(error) && (!error.response || error.code === 'ERR_NETWORK')) {
    return { kind: 'offline', message: OFFLINE_MESSAGE };
  }
  return { ...meta, kind: 'other', message: known ?? base.message };
}

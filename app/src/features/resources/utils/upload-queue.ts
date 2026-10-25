import type { UploadItem } from '@/core/uploads/upload.types';

import type { UploadTarget } from '../store/resource-uploads.store';
import { uploadFailureMessage } from './error-messages';

export type QueueRowState =
  'cancelled' | 'done' | 'failed' | 'paused' | 'processing' | 'queued' | 'uploading';

/** Thử lại thế nào: tải lại từ đầu (`upload`) hay chỉ gọi lại `POST /resources` (`finalize`). */
export type QueueRetryKind = 'finalize' | 'upload';

export interface QueueRow {
  canCancel: boolean;
  localId: string;
  name: string;
  progress: number;
  reason?: string;
  retry: QueueRetryKind | null;
  size: number;
  state: QueueRowState;
}

/**
 * Gộp trạng thái upload (`core/uploads`) với bước "thêm vào kho" thành MỘT dòng
 * cho người dùng. `ready` của upload KHÔNG phải "xong": tệp mới thật sự nằm
 * trong kho khi `POST /resources` thành công (`target.phase === 'created'`).
 */
export function buildQueueRow(item: UploadItem, target: UploadTarget | undefined): QueueRow {
  const base = { localId: item.localId, name: item.name, size: item.size, progress: item.progress };

  switch (item.status) {
    case 'queued':
    case 'creating':
      return { ...base, canCancel: true, retry: null, state: 'queued' };
    case 'uploading':
      return { ...base, canCancel: true, retry: null, state: 'uploading' };
    case 'paused':
      return { ...base, canCancel: true, retry: null, state: 'paused' };
    case 'processing':
      return { ...base, canCancel: true, retry: null, state: 'processing' };
    case 'cancelled':
      return { ...base, canCancel: false, retry: null, state: 'cancelled' };
    case 'failed':
      return {
        ...base,
        canCancel: false,
        reason: uploadFailureMessage(item.errorCode),
        retry: 'upload',
        state: 'failed',
      };
    case 'ready':
      break;
  }

  if (target?.phase === 'created') {
    return { ...base, canCancel: false, retry: null, state: 'done' };
  }
  if (target?.phase === 'failed') {
    return {
      ...base,
      canCancel: false,
      reason: uploadFailureMessage(target.errorCode),
      retry: 'finalize',
      state: 'failed',
    };
  }
  // `ready` mà chưa `created`: đang chờ/đang gọi `POST /resources` — không huỷ được nữa.
  return { ...base, canCancel: false, retry: null, state: 'processing' };
}

export function buildQueueRows(
  items: readonly UploadItem[],
  targets: Readonly<Record<string, UploadTarget>>,
): QueueRow[] {
  return items.map((item) => buildQueueRow(item, targets[item.localId]));
}

/** Nhãn trạng thái một dòng — CHỮ, không chỉ thanh tiến độ/màu (trợ năng). */
export function queueStateLabel(row: Pick<QueueRow, 'progress' | 'reason' | 'state'>): string {
  switch (row.state) {
    case 'queued':
      return 'Đang chờ';
    case 'uploading':
      return `Đang tải ${row.progress}%`;
    case 'processing':
      return 'Đang xử lý';
    case 'paused':
      return 'Tạm dừng — chờ kết nối';
    case 'done':
      return 'Xong';
    case 'cancelled':
      return 'Đã huỷ';
    case 'failed':
      return row.reason ?? 'Lỗi';
  }
}

export interface QueueSummary {
  /** Đang chờ/đang tải/đang xử lý/tạm dừng. */
  active: number;
  done: number;
  failed: number;
  /** 0..100 trung bình trên các dòng còn chạy; `0` khi không có dòng nào. */
  progress: number;
  total: number;
}

export function summarizeQueue(rows: readonly QueueRow[]): QueueSummary {
  const activeRows = rows.filter((row) =>
    ['paused', 'processing', 'queued', 'uploading'].includes(row.state),
  );
  const progress = activeRows.length
    ? Math.round(activeRows.reduce((sum, row) => sum + row.progress, 0) / activeRows.length)
    : 0;
  return {
    active: activeRows.length,
    done: rows.filter((row) => row.state === 'done').length,
    failed: rows.filter((row) => row.state === 'failed').length,
    progress,
    total: rows.length,
  };
}

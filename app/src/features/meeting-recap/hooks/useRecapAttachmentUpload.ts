import { useEffect, useRef } from 'react';

import { useUploadStore } from '@/core/uploads/upload.store';
import type { PickedFile } from '@/core/uploads/upload.types';
import { useUpload } from '@/core/uploads/use-upload';
import { showToast } from '@/shared/utils/toast.utils';

import { meetingRecapService } from '../api/meeting-recap.service';
import type { RecapDto } from '../api/meeting-recap.types';
import { recapUploadScopeKey } from '../constants/meeting-recap.constants';
import { errorCodeOf, recapErrorMessage } from '../utils/recap-errors';

/**
 * Đính kèm tệp cho biên bản (app.md §4.1): tệp đi qua hàng đợi upload chung của p0-05 (`scope: 'MEETING'` — BE chỉ nhận asset scope
 * `MEETING` của CHÍNH người gửi), khi `READY` thì `POST /meetings/:id/recap/attachments` rồi gỡ khỏi hàng đợi. Lỗi (quá số tệp
 * `MEET_022`, asset không hợp lệ `ASSET_*`) → tệp `failed` NGAY tại khu tệp, không mất nội dung đang soạn.
 *
 * ⚠️ Người gắn chạy trong màn soạn: rời màn giữa lúc tải thì tệp đã tải xong nằm lại hàng đợi (không tự gắn) — `useRecapDraftGuard` hỏi
 * trước khi rời khi còn tệp đang tải.
 */
export function useRecapAttachmentUpload(meetingId: string, remaining: number, onAttached: (dto: RecapDto) => void) {
  const scopeKey = recapUploadScopeKey(meetingId);
  const { cancel, enqueue, items, retry } = useUpload('MEETING', scopeKey);
  const inFlight = useRef(new Set<string>());
  const attachedRef = useRef(onAttached);
  useEffect(() => {
    attachedRef.current = onAttached;
  }, [onAttached]);

  useEffect(() => {
    items.forEach((item) => {
      if (item.status !== 'ready' || !item.assetId || inFlight.current.has(item.localId)) return;
      inFlight.current.add(item.localId);
      meetingRecapService
        .attach(meetingId, item.assetId)
        .then((dto) => {
          attachedRef.current(dto);
          useUploadStore.getState().removeItem(item.localId);
        })
        .catch((error: unknown) => {
          useUploadStore.getState().updateItem(item.localId, { errorCode: errorCodeOf(error) ?? 'UNKNOWN', status: 'failed' });
          showToast('error', recapErrorMessage(error));
        })
        .finally(() => inFlight.current.delete(item.localId));
    });
  }, [items, meetingId]);

  const pending = items.filter((item) => item.status !== 'failed' && item.status !== 'cancelled').length;

  const addFiles = (files: PickedFile[]) => {
    if (files.length === 0) return;
    const room = Math.max(0, remaining - pending);
    if (files.length > room) showToast('warning', 'Biên bản đã đạt số tệp đính kèm tối đa.');
    enqueue(files.slice(0, room));
  };

  return {
    addFiles,
    cancel,
    items,
    /** Còn tệp đang tải/chờ gắn — rời màn lúc này thì tệp không vào biên bản. */
    pending,
    remove: (localId: string) => useUploadStore.getState().removeItem(localId),
    retry,
  };
}

import { useState } from 'react';

import type { RecapDto } from '../api/meeting-recap.types';
import { FALLBACK_RECAP_LIMITS } from '../constants/meeting-recap.constants';
import { useDetachRecapAsset, useRecap } from '../queries/recap.queries';
import { recapErrorMessage } from '../utils/recap-errors';
import { useRecapAttachmentUpload } from './useRecapAttachmentUpload';

/**
 * Khu tệp của trình soạn biên bản: danh sách tệp ĐÃ gắn (đọc từ cache `recapKeys.detail` — mọi lần gắn/gỡ server trả `RecapDto` mới rồi ghi
 * cache), hàng đợi tải lên, gỡ tệp, mở/đóng tấm chọn nguồn. Mọi thay đổi phiên bản do gắn/gỡ đi qua `onChanged` để trình soạn giữ đúng CAS.
 */
export function useRecapFiles(meetingId: string, initialCount: number, onChanged: (dto: RecapDto) => void) {
  const recap = useRecap(meetingId);
  const detachMutation = useDetachRecapAsset(meetingId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attachments = recap.data?.attachments ?? [];
  const count = recap.data ? attachments.length : initialCount;
  const remaining = Math.max(0, FALLBACK_RECAP_LIMITS.attachmentsMax - count);
  const uploads = useRecapAttachmentUpload(meetingId, remaining, (dto) => {
    setError(null);
    onChanged(dto);
  });

  const detach = async (assetId: string) => {
    setRemovingId(assetId);
    setError(null);
    try {
      onChanged(await detachMutation.mutateAsync(assetId));
    } catch (err) {
      setError(recapErrorMessage(err));
    } finally {
      setRemovingId(null);
    }
  };

  return {
    attachments,
    closePicker: () => setPickerOpen(false),
    detach,
    error,
    openPicker: () => setPickerOpen(true),
    pending: uploads.pending,
    pickerOpen,
    remaining: Math.max(0, remaining - uploads.pending),
    removingId,
    uploads,
  };
}

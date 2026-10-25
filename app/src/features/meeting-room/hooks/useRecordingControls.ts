import { useCallback, useState } from 'react';

import { showToast } from '@/shared/utils/toast.utils';
import { useCapabilities } from '@/shell/capabilities';

import { isHostLikeRole } from '../components/controls/role.utils';
import { meetingRoomApi, useMeetingRoomStore } from '../store/meeting-room.store';
import type { RecordingFailure } from '../utils/recording-errors';
import { isConsentLocked, isRecordingActive } from '../utils/recording-state.utils';
import {
  refreshConsentStatus,
  requestRecordingConsent,
  respondRecordingConsent,
  startRecording,
  stopRecording,
} from './meeting-room.recording-actions';

type Action = 'REQUEST' | 'RESPOND' | 'START' | 'STOP';

/**
 * Ghi hình trong phòng cho UI (p2-06 app.md §3): ai thấy nút "Ghi hình" (chủ trì/đồng chủ trì của PHIÊN + cuộc họp cho phép ghi + hạ tầng hỗ
 * trợ — `capabilities.features.meetingRecording` `available && enabled`), trạng thái bận từng thao tác, lỗi hiện tại (tấm/hộp thoại tự hiện).
 * Quyền thật do server quyết — đây chỉ ẩn/hiện.
 */
export function useRecordingControls() {
  const recording = useMeetingRoomStore((state) => state.recording);
  const role = useMeetingRoomStore((state) => state.role);
  const recordingAllowed = useMeetingRoomStore((state) => state.brief?.recordingAllowed ?? false);
  const feature = useCapabilities().data?.features.meetingRecording;
  const [busy, setBusy] = useState<Action | null>(null);
  const [failure, setFailure] = useState<RecordingFailure | null>(null);

  const run = useCallback(async (action: Action, fn: () => Promise<RecordingFailure | null>): Promise<boolean> => {
    setBusy(action);
    setFailure(null);
    try {
      const failed = await fn();
      setFailure(failed);
      return failed === null;
    } finally {
      setBusy(null);
    }
  }, []);

  const hostLike = isHostLikeRole(role);
  const supported = feature?.available === true && feature.enabled === true;

  return {
    active: isRecordingActive(recording),
    busy,
    /** Hiện nút/mục "Ghi hình": chủ trì của phiên + cuộc họp cho phép + hạ tầng hỗ trợ; đang ghi thì luôn hiện (để dừng được). */
    canControl: hostLike && ((supported && recordingAllowed) || isRecordingActive(recording)),
    clearFailure: () => setFailure(null),
    consentLocked: isConsentLocked(recording),
    failure,
    openSheet: () => {
      meetingRoomApi.patch({ sheet: 'RECORDING' });
      void refreshConsentStatus();
    },
    recording,
    request: () => run('REQUEST', requestRecordingConsent),
    respond: (accept: boolean) => run('RESPOND', () => respondRecordingConsent(accept)),
    /** "Cần đồng ý ghi hình" trên nút mic/camera bị khoá → mở lại hộp thoại đồng ý. */
    reopenConsent: () => meetingRoomApi.patch({ consentPrompt: 'LATE' }),
    start: () => run('START', startRecording),
    stop: async () => {
      const ok = await run('STOP', stopRecording);
      if (!ok) showToast('error', 'Không dừng được ghi hình. Hãy thử lại.');
    },
  };
}

export type RecordingControls = ReturnType<typeof useRecordingControls>;

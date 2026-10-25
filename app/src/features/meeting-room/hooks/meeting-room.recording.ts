import { showToast } from '@/shared/utils/toast.utils';

import type { CallRecordingPayload, RoomRecordingState } from '../api/meeting-room.types';
import { meetingRoomApi, type RoomRecording } from '../store/meeting-room.store';
import { consentPromptFor, countsOf, isRecordingActive, mergeServerRecording } from '../utils/recording-state.utils';

/**
 * `call:recording` → store (p2-06 app.md §4.2). Hàm THUẦN (không React) để chạy cả khi màn phòng đã thu nhỏ (`useMeetingRoomEvents` chỉ nối
 * `useSocketEvent` vào đây) và để test bằng cách gọi thẳng. Sự kiện của phiên KHÁC bị bỏ. Server là nguồn sự thật cho "mình đã đồng ý chưa":
 * lúc bản ghi bắt đầu mà client không chắc (vào sau, lỡ sự kiện) thì tải lại ảnh chụp phòng (`resync`) — `consentRequired` ở đó tính theo người xem.
 */

const ALL_PUBLISH = { audio: true, screen: true, video: true } as const;

function set(recording: RoomRecording | null, extra: Partial<ReturnType<typeof meetingRoomApi.get>> = {}): void {
  meetingRoomApi.patch({ consentPrompt: consentPromptFor(recording), recording, ...extra });
}

/** Bản ghi kết thúc (dừng xong / lỗi): tắt chỉ báo; người bị khoá phát vì ghi hình được mở lại (BE cũng mở lại — `restorePublishAfterRecording`). */
function finish(prev: RoomRecording | null, message: string): void {
  const { sheet } = meetingRoomApi.get();
  set(null, {
    ...(prev?.consentRequired && isRecordingActive(prev) ? { publish: { ...ALL_PUBLISH } } : {}),
    ...(sheet === 'RECORDING' ? { sheet: 'NONE' as const } : {}),
  });
  if (prev && isRecordingActive(prev)) showToast('info', message);
}

export function handleCallRecording(payload: CallRecordingPayload, meId: string | undefined, resync: () => void): void {
  const state = meetingRoomApi.get();
  if (!state.callId || payload.callId !== state.callId) return;
  const prev = state.recording;

  switch (payload.state) {
    case 'CONSENT_REQUESTED': {
      if (isRecordingActive(prev)) return; // đang ghi thì không có yêu cầu mới (BE `REC_002`)
      const mine = payload.requestedBy === meId;
      set({
        consentRequired: !mine,
        counts: countsOf(payload),
        expiresAt: payload.expiresAt,
        requestId: payload.requestId,
        startedBy: payload.requestedBy,
        status: 'CONSENT_REQUESTED',
      });
      return;
    }
    case 'CONSENT_PROGRESS':
      if (prev?.status === 'CONSENT_REQUESTED' && prev.requestId === payload.requestId) {
        meetingRoomApi.patch({ recording: { ...prev, counts: countsOf(payload), expiresAt: payload.expiresAt ?? prev.expiresAt } });
      }
      return;
    case 'STARTING':
    case 'RECORDING': {
      const active = isRecordingActive(prev) && prev?.recordingId === payload.recordingId;
      // Chắc chắn đã đồng ý: mình là người bắt đầu, hoặc đã ĐỒNG Ý đúng yêu cầu vừa dùng. Còn lại coi như chưa rồi hỏi server cho chắc.
      const agreed = payload.requestedBy === meId || (prev?.status === 'CONSENT_REQUESTED' && !prev.consentRequired && !prev.declined);
      const consentRequired = active ? (prev?.consentRequired ?? true) : !agreed;
      set({
        consentRequired,
        declined: active ? prev?.declined : undefined,
        recordingId: payload.recordingId,
        startedAt: payload.startedAt,
        startedBy: payload.requestedBy,
        status: payload.state,
      });
      // Bản ghi MỚI mà mình không phải người bắt đầu: hỏi lại server (`consentRequired` theo người xem) — lỡ sự kiện/vào giữa chừng vẫn đúng.
      if (!active && payload.requestedBy !== meId) resync();
      return;
    }
    case 'STOPPING':
      if (prev) set({ ...prev, status: 'STOPPING' });
      return;
    case 'STOPPED':
      finish(prev, 'Đã dừng ghi hình. Bản ghi đang được xử lý.');
      return;
    case 'FAILED':
      finish(prev, 'Ghi hình gặp lỗi và đã dừng.');
      return;
  }
}

/** Ảnh chụp phòng/`join` vừa tải về (trạng thái THEO NGƯỜI XEM) → ghép vào store, giữ tiến độ + lựa chọn "Chỉ xem" của cùng bản ghi. */
export function applyServerRecording(next: RoomRecordingState | null): void {
  const prev = meetingRoomApi.get().recording;
  if (prev && isRecordingActive(prev) && !isRecordingActive(next)) {
    finish(prev, 'Đã dừng ghi hình. Bản ghi đang được xử lý.');
    return;
  }
  set(mergeServerRecording(prev, next));
}

/** Yêu cầu đồng ý hết hạn (đếm ngược ở hộp thoại/tấm tới `expiresAt`): chỉ dọn nếu vẫn là ĐÚNG yêu cầu đó và chưa bắt đầu ghi. */
export function expireConsentRequest(requestId: string): void {
  const prev = meetingRoomApi.get().recording;
  if (prev?.status === 'CONSENT_REQUESTED' && prev.requestId === requestId) set(null);
}

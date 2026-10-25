import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { getCallMedia } from '@/core/media/call-media.registry';
import { ensureCameraPermission, ensureMicrophonePermission } from '@/core/media/permissions';
import { showToast } from '@/shared/utils/toast.utils';

import { usePomodoroStore } from '../store/pomodoro.store';

/**
 * Mic/camera/loa trong phòng học — trạng thái THẬT lấy từ giá trị cổng media trả về (SDK có thể từ chối), không giả định.
 *  · Quyền hệ điều hành xin LÚC BẬT (vào phòng mic/camera tắt, không hỏi gì — app.md §6); từ chối ⇒ toast, media giữ nguyên.
 *  · `micLocked` (server: phase tập trung, trừ chủ phòng được miễn) ⇒ KHÔNG bật được. Máy chủ media cũng từ chối publish nên đây chỉ là
 *    lớp UI nói rõ lý do; ⛔ client KHÔNG tự tắt mic khi sang FOCUS — LiveKit đã thu quyền và trạng thái track tới qua sự kiện SDK (app.md §4).
 *  · Sang BREAK KHÔNG tự bật mic (PM-06): chỉ mở khoá, người dùng tự bấm.
 */
export function usePomodoroMedia(micLocked: boolean) {
  const { cameraOn, micDenied, micOn, speakerOn } = usePomodoroStore(
    useShallow((state) => ({
      cameraOn: state.room.cameraOn,
      micDenied: state.room.micDenied,
      micOn: state.room.micOn,
      speakerOn: state.room.speakerOn,
    })),
  );
  const patchRoom = usePomodoroStore((state) => state.patchRoom);

  const toggleMic = useCallback(async () => {
    if (micLocked) return;
    const wasOn = usePomodoroStore.getState().room.micOn;
    if (!wasOn) {
      if ((await ensureMicrophonePermission()) !== 'granted') {
        patchRoom({ micDenied: true });
        showToast('warning', 'Chưa có quyền micro — cấp quyền trong Cài đặt để nói.');
        return;
      }
      patchRoom({ micDenied: false });
    }
    try {
      patchRoom({ micOn: await getCallMedia().setMicrophoneEnabled(!wasOn) });
    } catch {
      showToast('warning', 'Không bật được micro ở giai đoạn này.');
    }
  }, [micLocked, patchRoom]);

  const toggleCamera = useCallback(async () => {
    const wasOn = usePomodoroStore.getState().room.cameraOn;
    if (!wasOn && (await ensureCameraPermission()) !== 'granted') {
      showToast('warning', 'Chưa có quyền camera — cấp quyền trong Cài đặt để bật.');
      return;
    }
    try {
      patchRoom({ cameraOn: await getCallMedia().setCameraEnabled(!wasOn) });
    } catch {
      showToast('warning', 'Không bật được camera.');
    }
  }, [patchRoom]);

  const toggleSpeaker = useCallback(async () => {
    const next = !usePomodoroStore.getState().room.speakerOn;
    await getCallMedia().setSpeakerOn(next);
    patchRoom({ speakerOn: next });
  }, [patchRoom]);

  return { cameraOn, micDenied, micOn, speakerOn, toggleCamera, toggleMic, toggleSpeaker };
}

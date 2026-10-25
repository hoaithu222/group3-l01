import { useCallback } from 'react';

import { getCallMedia } from '@/core/media/call-media.registry';
import { ensureCameraPermission, ensureMicrophonePermission } from '@/core/media/permissions';
import { showToast } from '@/shared/utils/toast.utils';

import { useCallControls } from '../../hooks/useCallControls';
import { useCallMediaStore } from '../../store/call-media.store';
import { useVoiceRoomStore } from '../store/voice-room.store';

/**
 * Mic/camera/loa của phòng thoại: `useCallControls` (trạng thái THẬT từ cổng media) + hai luật riêng của phòng:
 *  · quyền mic/camera xin LÚC BẬT (không xin khi vào — "Tham gia để nghe" không hỏi gì, VR-02), từ chối ⇒ toast, media giữ nguyên;
 *  · bị chủ phòng chặn phát biểu ⇒ KHÔNG bật được (server cũng từ chối publish — VR-08); bỏ chặn không tự bật mic.
 */
export function useRoomControls() {
  const base = useCallControls();
  const audioBlocked = useVoiceRoomStore((state) => state.audioBlocked);
  const patchMedia = useCallMediaStore((state) => state.patch);

  const toggleMic = useCallback(async () => {
    if (useVoiceRoomStore.getState().audioBlocked) return;
    if (!useCallMediaStore.getState().micOn) {
      if ((await ensureMicrophonePermission()) !== 'granted') {
        patchMedia({ micDenied: true });
        showToast('warning', 'Chưa có quyền micro — cấp quyền trong Cài đặt để nói.');
        return;
      }
      patchMedia({ micDenied: false });
    }
    await base.toggleMic();
    useVoiceRoomStore.getState().patch({ inviteSpeakAt: null, muteRequestAt: null });
  }, [base, patchMedia]);

  const toggleCamera = useCallback(async () => {
    if (!useCallMediaStore.getState().cameraOn && (await ensureCameraPermission()) !== 'granted') {
      showToast('warning', 'Chưa có quyền camera — cấp quyền trong Cài đặt để bật.');
      return;
    }
    await base.toggleCamera();
  }, [base]);

  /** "Tắt mic" từ lời nhắc của chủ phòng — chỉ TẮT (không đảo), an toàn khi bấm lúc mic đã tắt. */
  const muteMic = useCallback(async () => {
    const on = await getCallMedia().setMicrophoneEnabled(false);
    patchMedia({ micOn: on });
    useVoiceRoomStore.getState().patch({ muteRequestAt: null });
  }, [patchMedia]);

  return { ...base, audioBlocked, muteMic, toggleCamera, toggleMic };
}

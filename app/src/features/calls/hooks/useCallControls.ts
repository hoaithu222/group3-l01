import { useCallback } from 'react';

import { getCallMedia } from '@/core/media/call-media.registry';

import { useCallMediaStore } from '../store/call-media.store';

/** Mic/camera/loa của cuộc gọi — trạng thái THẬT lấy từ giá trị cổng media trả về (SDK có thể từ chối), không giả định. */
export function useCallControls() {
  const micOn = useCallMediaStore((state) => state.micOn);
  const cameraOn = useCallMediaStore((state) => state.cameraOn);
  const speakerOn = useCallMediaStore((state) => state.speakerOn);
  const patch = useCallMediaStore((state) => state.patch);

  const toggleMic = useCallback(async () => {
    const next = await getCallMedia().setMicrophoneEnabled(!useCallMediaStore.getState().micOn);
    patch({ micOn: next });
  }, [patch]);

  const toggleCamera = useCallback(async () => {
    const next = await getCallMedia().setCameraEnabled(!useCallMediaStore.getState().cameraOn);
    patch({ cameraOn: next });
  }, [patch]);

  const toggleSpeaker = useCallback(async () => {
    const next = !useCallMediaStore.getState().speakerOn;
    await getCallMedia().setSpeakerOn(next);
    patch({ speakerOn: next });
  }, [patch]);

  const flipCamera = useCallback(() => getCallMedia().flipCamera(), []);

  return { cameraOn, flipCamera, micOn, speakerOn, toggleCamera, toggleMic, toggleSpeaker };
}

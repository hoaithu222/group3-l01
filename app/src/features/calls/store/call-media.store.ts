import { create } from 'zustand';

import type { CallMediaConnectionState, CallMediaParticipant } from '@/core/media/call-media.types';

/**
 * Trạng thái MEDIA của cuộc gọi hiện tại (mic/camera/loa, người trong phòng theo SDK) — tách khỏi `callStore` vì hai thứ
 * có nhịp khác nhau: `callStore` đổi theo tín hiệu server (ít, có `version`), còn đây đổi theo SDK (ồn: người nói, track).
 * Gộp chung thì mỗi lần ai đó nói lại vẽ lại cả màn cuộc gọi.
 */
export interface CallMediaState {
  cameraOn: boolean;
  connection: CallMediaConnectionState;
  /** Ghi chú quyền bị từ chối lúc vào cuộc gọi — UI hiện dòng nhắc "chỉ nghe được". */
  micDenied: boolean;
  micOn: boolean;
  participants: CallMediaParticipant[];
  speakerOn: boolean;
}

interface CallMediaStore extends CallMediaState {
  patch: (partial: Partial<CallMediaState>) => void;
  reset: () => void;
}

const INITIAL: CallMediaState = {
  cameraOn: false,
  connection: 'idle',
  micDenied: false,
  micOn: false,
  participants: [],
  speakerOn: false,
};

export const useCallMediaStore = create<CallMediaStore>()((set) => ({
  ...INITIAL,
  patch: (partial) => set(partial),
  reset: () => set({ ...INITIAL }),
}));

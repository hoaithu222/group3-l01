import { create } from 'zustand';

import { reduceCall } from './call-signal.reducer';
import { INITIAL_CALL_STATE, type CallSessionState, type CallSignal } from './call-signal.types';

interface CallStore extends CallSessionState {
  dispatch: (signal: CallSignal) => void;
}

/**
 * Store cuộc gọi — MỘT thực thể cho cả app (một máy chỉ ở trong một cuộc gọi). Toàn bộ chuyển trạng thái nằm ở
 * `reduceCall` (hàm thuần, có test); store chỉ giữ state + đường `dispatch`. `set` gộp nông nên `dispatch` không mất
 * khi reducer trả về `INITIAL_CALL_STATE` (không có hàm).
 */
export const useCallStore = create<CallStore>()((set) => ({
  ...INITIAL_CALL_STATE,
  dispatch: (signal) => set((state) => reduceCall(state, signal)),
}));

/** Đọc/ghi NGOÀI React (handler socket, hook mutation, đăng xuất). */
export const callStoreApi = {
  dispatch: (signal: CallSignal): void => useCallStore.getState().dispatch(signal),
  get: (): CallSessionState => useCallStore.getState(),
};

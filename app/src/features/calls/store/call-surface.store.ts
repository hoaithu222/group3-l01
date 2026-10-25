import { create } from 'zustand';

/**
 * AI đang sở hữu phiên media của cuộc gọi.
 *
 * Từ p2-02 (chuông màn khoá) app có thể có **hai cây React trong cùng một JS runtime**: root
 * `main` (expo-router, `MainActivity`) và root `IncomingCall` (`IncomingCallActivity`, bung trên
 * màn khoá). Cả hai đều mount `useCallSession` — nếu cả hai cùng `connect()` thì LiveKit thấy
 * hai kết nối cùng `identity` và **đá một cái ra** (`DUPLICATE_IDENTITY`), tức cuộc gọi tự rụng
 * ngay khi người dùng mở khoá máy.
 *
 * Nên: đúng MỘT chủ sở hữu tại một thời điểm. `lockscreen` THẮNG khi đang mount (nó là màn người
 * dùng đang nhìn); mặc định `main` để iOS và mọi luồng cũ không đổi hành vi một chút nào.
 */
export type CallSurface = 'lockscreen' | 'main';

interface CallSurfaceStore {
  owner: CallSurface;
  /** Màn khoá giành quyền; `main` chỉ nhận lại khi màn khoá nhả ra. */
  claim: (surface: CallSurface) => void;
  /** Nhả quyền — chỉ có tác dụng nếu chính mình đang giữ (tránh nhả nhầm lượt của người khác). */
  release: (surface: CallSurface) => void;
}

export const useCallSurfaceStore = create<CallSurfaceStore>()((set) => ({
  owner: 'main',
  claim: (surface) => set({ owner: surface }),
  release: (surface) => set((state) => (state.owner === surface ? { owner: 'main' } : state)),
}));

/** Đọc ngoài React (controller media, handler native). */
export const callSurfaceApi = {
  claim: (surface: CallSurface): void => useCallSurfaceStore.getState().claim(surface),
  owner: (): CallSurface => useCallSurfaceStore.getState().owner,
  release: (surface: CallSurface): void => useCallSurfaceStore.getState().release(surface),
};

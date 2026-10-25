import { create } from 'zustand';

/**
 * Trạng thái khoá ứng dụng (P1) — `locked`, KHÔNG persist.
 *
 * ⛔ Không persist là chủ ý: nếu app bị hệ điều hành giết trong lúc `locked: true`
 * còn nằm trong bộ nhớ persist, lần mở SAU sẽ đọc lại `locked: true` từ đĩa
 * TRƯỚC KHI `useSessionBootstrap` kịp chạy — nhưng lúc đó còn chưa biết có phiên
 * hay không, và cũng chưa chắc còn `binding` sinh trắc học nào để mở khoá. Quyết
 * định khoá PHẢI được tính LẠI mỗi lần khởi động (`shouldLockOnColdStart` trong
 * `app-lock.policy.ts`, gọi từ `useSessionBootstrap`), không phải nhớ từ lần
 * trước.
 */
interface AppLockState {
  locked: boolean;
}

interface AppLockActions {
  lock: () => void;
  unlock: () => void;
}

export const useAppLockStore = create<AppLockState & AppLockActions>((set) => ({
  locked: false,
  lock: () => set({ locked: true }),
  unlock: () => set({ locked: false }),
}));

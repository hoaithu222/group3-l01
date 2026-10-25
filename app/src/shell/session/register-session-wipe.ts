import { onSessionEnded } from '@/core/api/session-end';

import { wipeUserData } from './wipe-user-data';

/**
 * Nối `wipeUserData()` vào `onSessionEnded` — chạy ở TẦM MODULE (import từ
 * `useSessionBootstrap.ts`), không phải trong effect: `purgeSession()` có thể chạy ngay ở lượt
 * khôi phục phiên đầu tiên (refresh trả 401), TRƯỚC mọi effect của cây route.
 *
 * `core/api` chỉ GIỮ danh sách người nghe (nó không được biết feature nào); đây là chỗ vỏ ứng
 * dụng đăng ký hàm dọn thật. Idempotent: nạp module hai lần (Fast Refresh) không đăng ký đôi.
 */
let unsubscribe: (() => void) | null = null;

export function registerSessionWipe(): void {
  if (unsubscribe) return;
  // `info.userId` được chụp TRƯỚC `clearAuth()` — lúc này store đã rỗng, nên phải truyền tường minh.
  unsubscribe = onSessionEnded((info) => wipeUserData(info.userId));
}

/** CHỈ dùng trong test: cho phép đăng ký lại sau `__resetSessionEndListenersForTests()`. */
export function __resetSessionWipeRegistrationForTests(): void {
  unsubscribe = null;
}

import { queryClient } from '@/core/config/query-client';
import { removeAllForUser } from '@/core/storage/session-scoped-storage';
import { logger } from '@/shared/utils/logger';
import { useAuthStore } from '@/shell/store/slices/auth';

import { WIPE_STEPS } from './wipe-steps';

/**
 * MỘT hàm dọn dữ liệu người dùng — dùng chung cho MỌI đường rời phiên.
 *
 * ── Ai gọi ──────────────────────────────────────────────────────────────────
 *  · `purgeSession()` (qua `onSessionEnded`, xem `register-session-wipe.ts`): đăng xuất, refresh
 *    trả 4xx, request 401 không cứu được, socket bị từ chối ở handshake. Ba đường sau KHÔNG đi
 *    qua `useLogout` — trước đây store của người cũ nằm nguyên cho người kế tiếp.
 *  · `useLogout`: dọn NGAY khi bấm, không chờ lượt `POST /auth/logout` (tối đa vài giây) — cuộc
 *    gọi đang mở không được sống thêm.
 *  · `completeSignIn`: đăng nhập sang tài khoản KHÁC mà không đăng xuất (mở khoá ứng dụng bằng
 *    mật khẩu của người khác).
 *
 * ── Không làm gì ────────────────────────────────────────────────────────────
 * ⛔ KHÔNG đụng token/hồ sơ phiên (`purgeSession()` lo) và KHÔNG đụng gắn kết sinh trắc học
 * (đăng xuất thường giữ — p0-13 §2). Danh sách store: `user-scoped-stores.constants.ts`.
 *
 * ── Khoá theo người dùng (`u:<userId>:*`) ───────────────────────────────────
 * `userId` là người VỪA RỜI phiên: `purgeSession()` truyền `SessionEndInfo.userId` (đã chụp TRƯỚC khi
 * `clearAuth()`), `completeSignIn` truyền người cũ khi đổi tài khoản. Bỏ trống thì lấy người đang có
 * trong `useAuthStore` (đúng ở `useLogout`, nơi hồ sơ còn nguyên lúc bấm). Khoá của NGƯỜI KHÁC giữ
 * nguyên — xem `core/storage/session-scoped-storage.ts`.
 *
 * Idempotent, không bao giờ ném: một bước hỏng chỉ bị ghi log, các bước còn lại vẫn chạy.
 */
export async function wipeUserData(userId?: string | null): Promise<void> {
  const pending: Promise<unknown>[] = [];
  const leavingUserId = userId !== undefined ? userId : (useAuthStore.getState().user?.id ?? null);

  for (const [id, step] of Object.entries(WIPE_STEPS)) {
    try {
      const result = step();
      if (result) pending.push(result.catch((error: unknown) => warn(id, error)));
    } catch (error) {
      warn(id, error);
    }
  }

  // Cache dữ liệu máy chủ theo tài khoản. `clear()` tự huỷ các lượt tải đang bay (huỷ im lặng).
  try {
    queryClient.clear();
  } catch (error) {
    warn('queryClient', error);
  }

  // Khoá `AsyncStorage` theo người dùng (nháp, tuỳ chọn cá nhân…) — `removeAllForUser` không bao giờ ném.
  pending.push(removeAllForUser(leavingUserId));

  await Promise.allSettled(pending);
}

function warn(step: string, error: unknown): void {
  if (__DEV__) {
    logger.warn(
      `[wipeUserData] bước "${step}" hỏng:`,
      error instanceof Error ? error.message : error,
    );
  }
}

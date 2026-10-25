import { router } from 'expo-router';

import { authService } from '@/core/api/auth';
import type { NormalizedSession } from '@/core/api/auth';
import { appConfig } from '@/core/config/env.config';
import { queryClient } from '@/core/config/query-client';
import { connectSocket } from '@/core/socket';
import { redirectToPendingInvite } from '@/features/members/store/pending-invite';
import { logger } from '@/shared/utils/logger';
import { useAppLockStore } from '@/shell/app-lock';
import { PATHS } from '@/shell/config';
import { reconcileBiometricBinding } from '@/shell/store/slices/biometric';
import { useAuthStore } from '@/shell/store/slices/auth';

import { clearExplicitLogout } from './logout-intent';
import { redirectToPostLoginIntent } from './post-login-intent';
import { wipeUserData } from './wipe-user-data';

/**
 * MỘT đường DUY NHẤT sau MỌI lượt đăng nhập thành công — mật khẩu, đăng ký,
 * sinh trắc học, mạng xã hội (Google), và mở khoá ứng dụng bằng mật khẩu (P1).
 *
 * ── Vì sao gom về một hàm ─────────────────────────────────────────────────────
 * Trước p0-13, `useLogin.ts` tự làm năm việc (xoá cache, lấy hồ sơ nếu thiếu, `setAuth`, điều
 * hướng…) NGAY TRONG hook của nó. Thêm sinh trắc học là thêm một nơi thứ hai phải chép lại, thêm
 * khoá ứng dụng là nơi thứ ba, và `useRegister` từng tự chép bản riêng — chép nhiều lần là chắc
 * chắn có lần quên `reconcileBiometricBinding()` hoặc dọn dữ liệu, và bug đó chỉ lộ ra khi có
 * người thật đổi tài khoản trên máy dùng chung.
 */

export type SignInMethod = 'BIOMETRIC' | 'PASSWORD' | 'SOCIAL';

export interface CompleteSignInOptions {
  method: SignInMethod;
  /**
   * `false` ⇒ ĐỨNG NGUYÊN màn hiện tại nếu đúng là người đang dùng (mở khoá ứng dụng bằng mật
   * khẩu). Trước đây mở khoá luôn `replace(HOME)`, văng người dùng khỏi màn họ đang làm dở
   * (BIO-16: "form đang nhập dở còn nguyên sau mở khoá"). Đổi sang TÀI KHOẢN KHÁC thì luôn về đầu.
   */
  navigate?: boolean;
}

export async function completeSignIn(
  session: NormalizedSession,
  { method, navigate = true }: CompleteSignInOptions,
): Promise<void> {
  if (__DEV__ && appConfig.enableApiLogging) {
    logger.info(`[sign-in] hoàn tất đăng nhập qua ${method}`);
  }

  // Người đang có trong store TRƯỚC lượt này — khác `null` chỉ khi đăng nhập chồng lên một phiên
  // còn sống (lớp phủ khoá). Sau đăng xuất/phiên chết `purgeSession()` đã xoá nó.
  const previousUserId = useAuthStore.getState().user?.id ?? null;

  // Một số backend không trả `user` kèm lượt đăng nhập/sinh trắc học.
  let user = session.user;
  if (!user) {
    try {
      user = await authService.me();
    } catch {
      // Lấy hồ sơ hỏng KHÔNG chặn đăng nhập — token đã hợp lệ, chỉ là danh sách quyền tạm thời
      // rút gọn cho tới lượt làm mới sau.
      user = null;
    }
  }

  const sameUser = previousUserId !== null && user?.id === previousUserId;
  const switchedUser = previousUserId !== null && user !== null && user.id !== previousUserId;

  if (switchedUser) {
    // Đăng nhập sang TÀI KHOẢN KHÁC mà không qua đăng xuất (mở khoá bằng mật khẩu người khác):
    // store chat/nháp/đáp án của người cũ phải đi hết, và socket/phòng cũ ngắt để nối lại bằng
    // token mới (bên dưới).
    await wipeUserData(previousUserId);
  } else if (!sameUser) {
    /**
     * ⛔ Xoá SẠCH cache TRƯỚC khi ghi phiên mới — cache của người TRƯỚC còn đó nếu không xoá, và
     * người MỚI thấy dữ liệu của người cũ trong khoảnh khắc giữa lúc vào màn hình và lúc request
     * mới trả về. (Mở khoá cùng tài khoản thì giữ cache: không có gì để tránh.)
     */
    queryClient.clear();
  }

  useAuthStore.getState().setAuth({ user, token: session.accessToken });
  if (switchedUser) connectSocket();

  /**
   * Đối chiếu gắn kết sinh trắc học VỚI NGƯỜI VỪA ĐĂNG NHẬP — không chỉ có ý nghĩa khi `method ===
   * 'BIOMETRIC'`. Đăng nhập bằng MẬT KHẨU của một tài khoản KHÁC tài khoản đang gắn trên máy cũng
   * phải gỡ gắn cũ (BIO-15) — máy dùng chung không được giữ gắn kết của người trước.
   */
  if (user) await reconcileBiometricBinding(user.id);

  clearExplicitLogout();

  /**
   * Kết thúc MỌI lượt đăng nhập ở trạng thái "đã mở khoá" — kể cả khi app chưa từng khoá (no-op
   * an toàn). Luồng mở khoá bằng mật khẩu gọi lại chính `completeSignIn` này nên phải tự tắt
   * `locked` ở đây.
   */
  useAppLockStore.getState().unlock();

  if (!navigate && sameUser) return;

  /**
   * Nơi đến sau đăng nhập, theo thứ tự ưu tiên — `replace` chứ ⛔ không `push` ở MỌI nhánh: Back
   * trên Android không được quay về màn đăng nhập.
   *  1. Lời mời đang chờ (MB-11, README p1-02): chưa đăng nhập → đăng ký → xác minh → quay lại.
   *     Đường mở-lạnh-lặng-lẽ có lối riêng ở `useSessionBootstrap.ts`.
   *  2. Link ngắn mở lúc chưa đăng nhập (`/live/{pin}`, `/w/…`, `/m/…`, `/s/…`).
   *  3. Trang chủ.
   */
  if (await redirectToPendingInvite()) return;
  if (await redirectToPostLoginIntent()) return;
  router.replace(PATHS.HOME);
}

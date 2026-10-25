import { logger } from '@/shared/utils/logger';

import { setAccessToken, setRefreshToken } from '../session';
import type { LoginResponse, NormalizedSession } from './auth.types';

/**
 * Hai hàm dùng CHUNG giữa `auth.service.ts` (mật khẩu) và
 * `biometric.service.ts` (sinh trắc học) — mọi lượt đăng nhập, bất kể phương
 * thức nào, đều chuẩn hoá phản hồi và ghi phiên theo ĐÚNG MỘT khuôn.
 *
 * Tách khỏi `auth.service.ts` để giữ file đó dưới trần 150 dòng
 * (`docs/rules/code-style.md`) — không phải vì hai hàm này cần dùng lại ở đâu
 * khác ngoài hai service auth.
 */

/** Gom hai cách đặt tên trường của backend (`accessToken`/`access_token`…) về một dạng. */
export function normalize(response: LoginResponse): NormalizedSession {
  return {
    accessToken: response.accessToken ?? response.access_token ?? '',
    refreshToken: response.refreshToken ?? response.refresh_token ?? null,
    user: response.user ?? null,
  };
}

/**
 * Ghi phiên vào đúng chỗ của nó: access token vào bộ nhớ, refresh token vào kho
 * khoá hệ điều hành.
 *
 * ⛔ `await` lượt ghi refresh token, đừng bắn rồi bỏ đó. Nếu kho khoá từ chối
 * (Keystore hỏng sau khi người dùng đổi khoá màn hình) thì phải biết NGAY, chứ
 * không phải phát hiện ở lần mở app sau khi người dùng đã bị đăng xuất.
 */
export async function persistSession(session: NormalizedSession): Promise<void> {
  if (session.refreshToken) {
    const saved = await setRefreshToken(session.refreshToken);
    if (!saved && __DEV__) {
      logger.warn(
        '[auth] Không ghi được refresh token vào kho khoá. Phiên vẫn dùng được tới khi ' +
          'đóng app, nhưng lần mở sau người dùng sẽ phải đăng nhập lại.',
      );
    }
  }
  setAccessToken(session.accessToken);
}

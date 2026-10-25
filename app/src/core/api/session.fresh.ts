import { TOKEN_EXPIRY_LEEWAY_MS } from '@/core/config/auth.config';
import { decodeJwtPayload } from '@/shared/utils/jwt.utils';

import { getAccessToken, refreshSession } from './session';

/**
 * Bảo đảm access token còn HẠN trước những lượt gọi KHÔNG được phép đi vòng qua
 * interceptor 401 (`skipAuthRefresh`) mà vẫn cần token thật: đăng xuất, đổi mật khẩu.
 *
 * ── Vì sao không để interceptor tự làm mới ───────────────────────────────────
 * Với các lượt xác nhận mật khẩu, 401 có nghĩa là SAI MẬT KHẨU chứ không phải hết
 * hạn — để interceptor "cứu" thì nó làm mới rồi phát lại, ăn 401 lần hai và DỌN
 * PHIÊN (đá người dùng ra chỉ vì gõ sai mật khẩu). Nên phía gọi tắt cờ đó và tự
 * làm mới TRƯỚC bằng hàm này.
 */

/** Token còn đủ hạn (trừ `TOKEN_EXPIRY_LEEWAY_MS`)? Không đọc được `exp` thì coi như còn hạn. */
export function isAccessTokenFresh(token: string | null, now: number = Date.now()): boolean {
  if (!token) return false;
  const exp = decodeJwtPayload<{ exp?: number }>(token)?.exp;
  if (typeof exp !== 'number') return true;
  return exp * 1000 - now > TOKEN_EXPIRY_LEEWAY_MS;
}

/**
 * `true` khi sau hàm này có access token dùng được. Chờ tối đa `maxWaitMs` — người
 * dùng bấm "Đăng xuất" thường vì sắp đưa máy cho người khác, không được để mạng
 * chậm giữ họ lại. Lượt refresh bỏ lại phía sau vẫn tự kết thúc (single-flight) và
 * `purgeSession()` chặn nó ghi token sau đó.
 */
export async function ensureFreshAccessToken(maxWaitMs = 5000): Promise<boolean> {
  if (isAccessTokenFresh(getAccessToken())) return true;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), maxWaitMs);
  });
  try {
    const outcome = await Promise.race([refreshSession(), timeout]);
    return outcome?.status === 'ok';
  } finally {
    clearTimeout(timer);
  }
}

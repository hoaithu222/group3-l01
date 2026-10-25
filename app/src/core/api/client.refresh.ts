import { appConfig } from '@/core/config/env.config';
import { logger } from '@/shared/utils/logger';

import { purgeSession, refreshSession } from './session';

/**
 * Hàng đợi làm mới access token cho interceptor 401.
 *
 * ── Vì sao có hàng đợi ───────────────────────────────────────────────────────
 * Khi 5 request cùng ăn 401 một lúc: request đầu chạy refresh, 4 request còn
 * lại nằm chờ ở đây rồi chạy tiếp bằng token mới.
 *
 * `refreshSession()` cũng có single-flight riêng; hai lớp bổ sung cho nhau chứ
 * không thừa: lớp dưới chống GỌI TRÙNG endpoint refresh, lớp này giữ lại
 * REQUEST GỐC để phát lại. Bỏ lớp này thì 4 request kia hỏng hẳn dù phiên đã
 * được cứu — người dùng thấy 4 ô dữ liệu trống trên một màn hình vừa mới sống lại.
 */

let refreshing = false;
let queue: { resolve: (token: string) => void; reject: (reason: unknown) => void }[] = [];

export function isRefreshInFlight(): boolean {
  return refreshing;
}

export function beginRefresh(): void {
  refreshing = true;
}

export function endRefresh(): void {
  refreshing = false;
}

/** Xếp request hiện tại vào hàng chờ; promise trả token mới khi có. */
export function waitForNewToken(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    queue.push({ resolve, reject });
  });
}

/**
 * Xả hàng đợi.
 *
 * `token` có giá trị → mọi request chờ chạy tiếp bằng token đó.
 * `token` là `null`  → tất cả bị từ chối với chính `error` truyền vào.
 *
 * ⛔ Truyền LẠI đúng `AxiosError` gốc, đừng ném `new Error(...)` thô: nơi gọi sẽ
 * mất `response`/`config`, và toast rơi về câu tiếng Anh mặc định của axios
 * giữa một giao diện tiếng Việt.
 */
export function drainQueue(error: unknown, token: string | null): void {
  const pending = queue;
  queue = [];
  for (const { resolve, reject } of pending) {
    if (token) resolve(token);
    else reject(error);
  }
}

/**
 * Làm mới access token. Trả token mới, hoặc `null` nếu không refresh được.
 *
 * ⛔ CHỈ `unauthenticated` (máy chủ nói thẳng phiên chết) mới dọn phiên.
 * `unavailable` (mất sóng / 5xx) GIỮ NGUYÊN phiên: request gốc hỏng như một lỗi
 * mạng bình thường, có sóng lại là lần refresh sau chạy tiếp.
 *
 * ── Không có `window.location` để chuyển trang ───────────────────────────────
 * Bản web kết thúc nhánh này bằng `window.location.assign('/login')`. Trên React
 * Native không có thứ đó, và cũng KHÔNG nên gọi router mệnh lệnh từ tầng core:
 * tầng core không được biết cây điều hướng trông ra sao.
 *
 * Thay vào đó ta chỉ dọn store, và `app/(app)/_layout.tsx` — vốn đang theo dõi
 * trạng thái phiên — tự chuyển về màn đăng nhập. Điều hướng suy ra từ trạng
 * thái, một chiều, không có lệnh chéo tầng.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const outcome = await refreshSession();

  if (outcome.status === 'ok') {
    if (appConfig.enableApiLogging) logger.info('✅ Đã làm mới access token');
    return outcome.accessToken;
  }

  if (outcome.status === 'unavailable') {
    if (appConfig.enableApiLogging) {
      logger.warn(`⚠️ Refresh hỏng tạm thời (${outcome.reason}) — GIỮ phiên`);
    }
    return null;
  }

  if (appConfig.enableApiLogging) logger.error('❌ Phiên không còn hiệu lực');
  await purgeSession();
  return null;
}

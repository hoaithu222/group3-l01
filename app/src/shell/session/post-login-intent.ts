import { router, type Href } from 'expo-router';

import { readJson, removeKey, writeJson } from '@/core/storage';

/**
 * Ý ĐỊNH điều hướng phải sống sót qua bước đăng nhập — link ngắn `/live/{pin}`, `/m/{id}`, `/c/{id}`,
 * `/s/{setId}`, `/w/{wsId}/…` mở lúc CHƯA đăng nhập.
 *
 * ── Vì sao có file này ───────────────────────────────────────────────────────
 * Các route ngắn đó (`app/live/[pin].tsx`…) chỉ `<Redirect>` sang màn thật trong `(app)`, và
 * hàng rào của `(app)` đẩy người chưa đăng nhập sang `/login` — đích rơi mất. Người nhập PIN
 * Live Quiz từ tin nhắn/QR đăng nhập xong thấy Trang chủ chứ không phải phòng chờ. Lời mời
 * (`/invite/…`) đã có cơ chế riêng (`pendingInvite`), file này lo phần còn lại.
 *
 * ── Lưu gì ──────────────────────────────────────────────────────────────────
 * CHÍNH đường dẫn NGẮN, không phải màn đích: sau đăng nhập `router.replace` lại đúng đường đó và
 * route ngắn tự chuyển tiếp. Nhờ vậy shell không phải biết feature nào (`joinHref`, `/study/…`).
 *
 * ⛔ Không lưu token/mã bí mật: chỉ tiền tố cho phép (`ALLOWED`), chỉ tham số `m` (id tin nhắn)
 * trong query, tối đa `MAX_LENGTH` ký tự. `AsyncStorage` thường (không phải kho khoá) là đủ —
 * PIN/id là thứ đã nằm trong link người dùng bấm.
 */

const STORAGE_KEY = 'auth.post-login-intent.v1';
/** Hết hạn — link mở hôm qua không được lôi người đăng nhập hôm nay. */
const TTL_MS = 30 * 60 * 1000;
const MAX_LENGTH = 300;

/** `/c|live|m|s|w/<đoạn>[/<đoạn>…]` — mỗi đoạn chỉ gồm ký tự an toàn. `/c/{conversationId}` là link hội thoại của p0-12. */
const ALLOWED = /^\/(?:c|live|m|s|w)(?:\/[A-Za-z0-9._~-]+)+$/;
/** Tham số query được giữ lại: id tin nhắn để cuộn tới (`/w/{ws}/c/{ch}?m=`, `/c/{conversationId}?m=`). */
const KEPT_QUERY_KEYS = ['m'] as const;

interface StoredIntent {
  path: string;
  savedAt: number;
}

/**
 * URL nhận từ hệ điều hành (`https://<miền>/live/123456`, `superapp://live/123456`) → đường dẫn
 * trong app, hoặc `null` nếu không phải link ngắn được phép. Hàm thuần.
 */
export function toPostLoginPath(url: string): string | null {
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?/.exec(url.trim());
  if (!match) return null;

  const [, scheme = '', authority = '', rawPath = '', rawQuery = ''] = match;
  // https: host là tên miền, đường dẫn nằm sau. Scheme riêng của app: `superapp://live/123` — phần
  // "host" chính là đoạn đầu của đường dẫn.
  const isWeb = /^https?$/i.test(scheme);
  const path = (isWeb ? rawPath : `/${authority}${rawPath}`).replace(/\/+$/, '');

  if (path.length > MAX_LENGTH || path.includes('..') || !ALLOWED.test(path)) return null;

  const query = new URLSearchParams(rawQuery);
  const kept = KEPT_QUERY_KEYS.flatMap((key) => {
    const value = query.get(key);
    return value && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? [`${key}=${value}`] : [];
  });
  return kept.length > 0 ? `${path}?${kept.join('&')}` : path;
}

export async function savePostLoginIntent(path: string): Promise<void> {
  const value: StoredIntent = { path, savedAt: Date.now() };
  await writeJson(STORAGE_KEY, value);
}

/** Đọc VÀ xoá (dùng một lần). `null` khi chưa có, hỏng hoặc đã hết hạn. */
export async function consumePostLoginIntent(): Promise<string | null> {
  const stored = await readJson<Partial<StoredIntent>>(STORAGE_KEY);
  if (!stored) return null;
  await removeKey(STORAGE_KEY);

  if (typeof stored.path !== 'string' || typeof stored.savedAt !== 'number') return null;
  if (Date.now() - stored.savedAt > TTL_MS) return null;
  // Kiểm lại lúc ĐỌC: dữ liệu trên đĩa không đáng tin bằng dữ liệu vừa qua `toPostLoginPath`.
  return toPostLoginPath(`app://${stored.path.replace(/^\//, '')}`) === stored.path
    ? stored.path
    : null;
}

export async function clearPostLoginIntent(): Promise<void> {
  await removeKey(STORAGE_KEY);
}

/**
 * Điều hướng tới ý định đang chờ (nếu có). Trả `true` khi đã điều hướng — nơi gọi dùng để BỎ QUA
 * điều hướng mặc định (`router.replace(PATHS.HOME)`). `replace` chứ không `push`: Back trên
 * Android sau đăng nhập không được quay về màn đăng nhập.
 */
export async function redirectToPostLoginIntent(): Promise<boolean> {
  const path = await consumePostLoginIntent();
  if (!path) return false;
  router.replace(path as Href);
  return true;
}

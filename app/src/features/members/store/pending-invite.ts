import { router } from 'expo-router';

import { deleteSecure, readSecure, writeSecure } from '@/core/storage/secure-storage';

/**
 * Lời mời đang chờ chấp nhận sau khi đăng nhập/đăng ký (README p1-02 MB-11,
 * app.md §5). Lưu ở kho khoá hệ điều hành — `pending-invite.ts` [đúng theo
 * app.md §2] — chứ không phải `AsyncStorage`: mã mời tuy không phải bí mật với
 * chính app, nhưng đây là kho khoá SẴN CÓ (`core/storage/secure-storage.ts`)
 * nên dùng lại thay vì mở thêm một đường ghi khác cho cùng một việc.
 *
 * ⛔ KHÔNG ghi log/analytics mã này — cùng luật với `core/api/client.ts`
 * (app.md §3: "Mã mời không đưa vào log API").
 */
const KEY = 'pendingInvite';
/** README p1-02 §2 "Quyết định thiết kế": TTL 1 giờ. */
const TTL_MS = 60 * 60 * 1000;

/**
 * `LINK` = link mời chung `/invite/{code}` (p1-02); `EMAIL` = lời mời đích danh
 * `/invite/e/{token}` (p3-04). Hai loại đi về HAI route khác nhau sau khi đăng
 * nhập, nên phải nhớ loại nào — thiếu là token email bị đưa vào màn link chung.
 */
export type PendingInviteKind = 'LINK' | 'EMAIL';

interface StoredPendingInvite {
  code: string;
  savedAt: number;
  /** Bản ghi cũ (trước p3-04) không có trường này → coi là `LINK`. */
  kind?: PendingInviteKind;
}

export interface PendingInviteEntry {
  code: string;
  kind: PendingInviteKind;
}

export const pendingInviteStore = {
  /** Gọi lúc người dùng bấm "Đăng nhập để tham gia"/"Tạo tài khoản" khi CHƯA đăng nhập. */
  async save(code: string, kind: PendingInviteKind = 'LINK'): Promise<void> {
    const value: StoredPendingInvite = { code, savedAt: Date.now(), kind };
    await writeSecure(KEY, JSON.stringify(value));
  },

  /** `null` khi chưa có, đọc hỏng, hoặc đã hết hạn (tự xoá luôn trong ca hết hạn). */
  async readEntry(): Promise<PendingInviteEntry | null> {
    const raw = await readSecure(KEY);
    if (!raw) return null;

    let value: StoredPendingInvite;
    try {
      value = JSON.parse(raw) as StoredPendingInvite;
    } catch {
      await deleteSecure(KEY);
      return null;
    }

    if (Date.now() - value.savedAt > TTL_MS) {
      await deleteSecure(KEY);
      return null;
    }
    return { code: value.code, kind: value.kind ?? 'LINK' };
  },

  /** Chỉ phần mã — giữ cho nơi gọi cũ; cần biết loại thì dùng `readEntry()`. */
  async read(): Promise<string | null> {
    return (await this.readEntry())?.code ?? null;
  },

  async clear(): Promise<void> {
    await deleteSecure(KEY);
  },
};

/**
 * Đọc `pendingInvite` còn hạn và điều hướng tới `/invite/{code}` nếu có.
 *
 * Gọi Ở HAI chỗ (cả hai đều được sinh đúng MỘT lần mỗi lượt, không lặp):
 *  · `useSessionBootstrap.ts` — sau khi phiên khôi phục lặng lẽ lúc mở lạnh
 *    thành công (app.md §1: "sau khi phiên `ok`");
 *  · `sign-in.ts#completeSignIn` — sau mọi lượt đăng nhập/đăng ký TƯƠNG TÁC,
 *    đúng luồng MB-11 ("chưa đăng nhập → đăng ký → xác minh → quay lại"): lượt
 *    khôi phục lặng lẽ ở trên KHÔNG chạy trong ca này (app đang mở sẵn, không
 *    phải mở lạnh), nên nếu chỉ gắn ở `useSessionBootstrap` thì MB-11 không
 *    bao giờ redirect được.
 *
 * Trả `true` khi đã điều hướng — nơi gọi dùng để BỎ QUA điều hướng mặc định
 * của chính nó (`router.replace(PATHS.HOME)`).
 */
export async function redirectToPendingInvite(): Promise<boolean> {
  const entry = await pendingInviteStore.readEntry();
  if (!entry) return false;
  if (entry.kind === 'EMAIL') {
    router.replace({ pathname: '/invite/e/[token]', params: { token: entry.code } });
    return true;
  }
  router.replace({ pathname: '/invite/[code]', params: { code: entry.code } });
  return true;
}

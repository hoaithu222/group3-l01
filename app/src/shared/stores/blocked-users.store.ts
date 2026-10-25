import { create } from 'zustand';

/**
 * Tập id người dùng MÌNH đã chặn (p1-08) — trạng thái CHUNG, đọc từ nhiều feature.
 *
 * ── Vì sao ở `shared/`, không ở `features/moderation/` ──────────────────────
 * `chat` (thu gọn tin của người bị chặn), `conversations` (thanh "Bỏ chặn để nhắn"),
 * `members` (nhãn Chặn/Bỏ chặn ở thẻ thành viên) đều cần biết "người này có bị mình
 * chặn không". Ba feature ấy KHÔNG được import `moderation` (`feature-structure.md`),
 * nên phần ĐỌC nằm ở đây; phần GHI (gọi `GET/POST/DELETE /me/blocks`, nghe `block:updated`)
 * nằm ở `moderation/hooks/useBlockedSync.ts` và `moderation/queries/blocks.queries.ts`.
 *
 * ── Nguồn dữ liệu ───────────────────────────────────────────────────────────
 * `GET /me/blocks` → `meta.allIds` (≤ 500 id, BE `LIMITS.block.max`): mọi trang đều kèm
 * đủ danh sách nên không phải tải hết các trang chỉ để lọc tin. `hydrate()` thay TOÀN BỘ
 * tập bằng bản server; `add`/`remove` là cập nhật LẠC QUAN và cập nhật từ socket
 * `block:updated`. Server luôn là nguồn thật: lần làm mới kế tiếp sẽ `hydrate()` lại.
 *
 * ⚠️ KHÔNG lưu xuống `AsyncStorage`: danh sách chặn thuộc về TÀI KHOẢN (đồng bộ đa thiết bị,
 * D-23), và lưu cục bộ là đưa dữ liệu của người trước cho người sau trên máy dùng chung.
 * Xoá khi đăng xuất qua `reset()` (`shell/session/useLogout.ts`).
 *
 * ⛔ Tập là bất biến: mỗi lần đổi tạo `Set` MỚI. Selector trả về chính tham chiếu `ids`
 * nên component chỉ vẽ lại khi tập THẬT SỰ đổi — sửa tại chỗ (`ids.add()`) thì không
 * component nào biết mà vẽ lại.
 */
interface BlockedUsersState {
  ids: ReadonlySet<string>;
  /** Đã có dữ liệu thật từ server (kể cả tập rỗng) — phân biệt "chưa biết" với "không chặn ai". */
  hydrated: boolean;
  hydrate: (ids: readonly string[]) => void;
  add: (userId: string) => void;
  remove: (userId: string) => void;
  reset: () => void;
}

const EMPTY: ReadonlySet<string> = new Set<string>();

export const useBlockedUsersStore = create<BlockedUsersState>((set) => ({
  ids: EMPTY,
  hydrated: false,

  hydrate: (ids) => set({ ids: new Set(ids), hydrated: true }),

  add: (userId) =>
    set((state) => {
      if (state.ids.has(userId)) return state;
      const next = new Set(state.ids);
      next.add(userId);
      return { ids: next };
    }),

  remove: (userId) =>
    set((state) => {
      if (!state.ids.has(userId)) return state;
      const next = new Set(state.ids);
      next.delete(userId);
      return { ids: next };
    }),

  reset: () => set({ ids: EMPTY, hydrated: false }),
}));

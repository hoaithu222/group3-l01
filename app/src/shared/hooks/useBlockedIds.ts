import { useBlockedUsersStore } from '@/shared/stores/blocked-users.store';

/**
 * Tập id người MÌNH đã chặn (p1-08) — `chat` dùng để thu gọn tin, `conversations`/`members`
 * để đổi nhãn Chặn ↔ Bỏ chặn. Tham chiếu ỔN ĐỊNH tới khi tập đổi thật (xem store).
 *
 * ⚠️ Chỉ là chặn MỘT chiều "mình chặn ai". App KHÔNG BAO GIỜ biết mình bị ai chặn (BE cố ý
 * giấu — README p1-08 §2 "Thông điệp khi bị chặn: trung tính").
 */
export function useBlockedIds(): ReadonlySet<string> {
  return useBlockedUsersStore((state) => state.ids);
}

/** `userId` có nằm trong danh sách mình đã chặn không. `null`/`undefined` (tin hệ thống) ⇒ `false`. */
export function useIsUserBlocked(userId: string | null | undefined): boolean {
  return useBlockedUsersStore((state) => (userId ? state.ids.has(userId) : false));
}

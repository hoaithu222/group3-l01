import { usePresenceStore } from './presence.store';
import type { PresenceEntry } from './presence.store';

/** Chưa có dữ liệu (chưa nhận `presence:updated` lần nào cho user này) ⇒ coi như OFFLINE. */
const FALLBACK: PresenceEntry = { state: 'OFFLINE', updatedAt: 0 };

/**
 * Presence của MỘT user, selector theo id.
 *
 * ⛔ Đọc CẢ `byUserId` rồi tự `[userId]` ở component là sai — mọi component sẽ
 * re-render mỗi khi BẤT KỲ user nào đổi presence, kể cả trên một danh sách dài
 * không liên quan. Selector ở đây trả về đúng tham chiếu `PresenceEntry` cũ khi
 * user này KHÔNG đổi (`presence.store.set` chỉ thay entry của đúng userId được
 * cập nhật, entry khác giữ nguyên tham chiếu) — Zustand so bằng `Object.is` nên
 * chỉ user vừa đổi mới kéo theo render lại.
 */
export function usePresence(userId: string | null | undefined): PresenceEntry {
  return usePresenceStore((state) => (userId ? (state.byUserId[userId] ?? FALLBACK) : FALLBACK));
}

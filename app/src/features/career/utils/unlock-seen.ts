/**
 * "Đã chúc mừng huy hiệu này chưa" — theo (người dùng, kỹ năng), TRONG BỘ NHỚ của phiên app.
 *
 * ⚠️ Khác app.md p6-06 §5 (AsyncStorage `skill-unlocked-seen:{userId}:{skillId}`): lưu bền thì phải khai file vào sổ dọn dữ liệu người dùng
 * `src/shell/session/user-scoped-stores.constants.ts` (thuộc vỏ app, không nằm trong phạm vi p6-06). Bộ nhớ là đủ cho "một lần/kỹ năng":
 * BE phát `skill:unlocked` đúng MỘT lần cho mỗi huy hiệu (dedupe outbox), nên mở lại app không nhận lại sự kiện cũ. Khoá gồm `userId` nên
 * đổi tài khoản trên cùng máy không lẫn.
 */
const seen = new Set<string>();

/** `true` khi đây là LẦN ĐẦU thấy (và đánh dấu luôn); `false` nếu đã chúc mừng rồi. */
export function markUnlockSeen(userId: string, skillId: string): boolean {
  const key = `${userId}:${skillId}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

/** Chỉ cho test. */
export function resetUnlockSeen(): void {
  seen.clear();
}

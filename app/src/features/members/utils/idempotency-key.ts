/**
 * Id CỤC BỘ dùng làm `Idempotency-Key` cho `POST …/invitations` và
 * `POST …/guests/invitations` — sinh MỖI LẦN MỞ form, giữ NGUYÊN tới khi gửi
 * được (app.md p3-04 §4), để bấm "Gửi" hai lần (mạng chậm, double-tap) không
 * tạo hai lời mời.
 *
 * ⛔ KHÔNG dùng `Crypto.randomUUID()` — trong Jest nó lặng lẽ trả `undefined`;
 * ở đây chỉ cần KHÔNG TRÙNG trong một phiên. Cùng mẫu `workspaces`/`channels`.
 */
let counter = 0;

export function newIdempotencyKey(prefix: string): string {
  counter += 1;
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${counter}-${random}`;
}

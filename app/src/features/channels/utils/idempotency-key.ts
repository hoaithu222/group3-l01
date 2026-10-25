/**
 * Id CỤC BỘ dùng làm `Idempotency-Key` cho `POST /workspaces/:id/channels` —
 * sinh khi mở `CreateChannelScreen`, giữ NGUYÊN tới khi tạo thành công (app.md
 * p1-03 §3). Bản sao TỐI GIẢN của `workspaces/utils/idempotency-key.ts` — luật
 * "không import chéo feature" (`feature-structure.md`); cùng lý do KHÔNG dùng
 * `Crypto.randomUUID()` (`expo-crypto`) đã ghi ở bản gốc: lặng lẽ `undefined`
 * trong Jest.
 */
let counter = 0;

export function newIdempotencyKey(prefix: string): string {
  counter += 1;
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${counter}-${random}`;
}

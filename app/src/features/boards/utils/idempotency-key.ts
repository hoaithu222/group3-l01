/**
 * Id CỤC BỘ dùng làm `Idempotency-Key` / `clientMutationId` — bản sao tối giản
 * của `workspaces/utils/idempotency-key.ts` (luật "không import chéo feature").
 *
 * ⛔ Không dùng `Crypto.randomUUID()` (`expo-crypto`): trong Jest nó lặng lẽ trả
 * `undefined`; ở đây chỉ cần KHÔNG TRÙNG trong một phiên. Độ dài luôn ≥ 8 và
 * ≤ 64 ký tự (`moveTaskSchema.clientMutationId`, be.md §3).
 */
let counter = 0;

export function newIdempotencyKey(prefix: string): string {
  counter += 1;
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${counter}-${random}`;
}

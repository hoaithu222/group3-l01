/**
 * Id CỤC BỘ dùng làm `Idempotency-Key` / `clientItemKey` — bản sao tối giản của `boards/utils/idempotency-key.ts`
 * (luật "không import chéo feature").
 *
 * ⛔ Không dùng `Crypto.randomUUID()` (`expo-crypto`): trong Jest nó lặng lẽ trả `undefined`; ở đây chỉ cần KHÔNG
 * TRÙNG trong một phiên và dài 8–64 ký tự (`clientItemKey` ≤ 64, Idempotency-Key ≥ 8).
 */
let counter = 0;

export function newLocalId(prefix: string): string {
  counter += 1;
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${counter}-${random}`;
}

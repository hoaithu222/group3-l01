/**
 * Id CỤC BỘ dùng làm `Idempotency-Key` cho `POST /conversations` — sinh lúc
 * vào bước 3 (app.md §3), giữ nguyên tới khi tạo thành công. Bản sao TỐI GIẢN
 * của `channels/utils/idempotency-key.ts` (`feature-structure.md`).
 */
let counter = 0;

export function newIdempotencyKey(prefix: string): string {
  counter += 1;
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${counter}-${random}`;
}

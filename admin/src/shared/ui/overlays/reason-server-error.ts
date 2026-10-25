import { isAxiosError } from 'axios';

/**
 * Câu lỗi của ô `reason` trong `VAL_001` do BE trả, hoặc `null` nếu lỗi này không nói về lý do.
 *
 * BE (`validateBody` → `ValidationError`) trả `error.details = flatten().fieldErrors` của Zod:
 * `{ reason: ['Lý do tối thiểu 10 ký tự'], … }`. Chỉ đọc khoá `reason` — lỗi `VAL_001` ở trường khác
 * (vd `value`, `action`) không phải chuyện của ô lý do nên để nơi gọi/toast chung xử lý.
 *
 * Nhận diện bằng dạng dữ liệu (`isAxiosError`) chứ KHÔNG import `@/core/api/error.handler`: `shared/ui`
 * không phụ thuộc `core`. Câu rỗng/không phải chuỗi → `FALLBACK` (vẫn gắn được vào ô).
 */
export const REASON_SERVER_ERROR_FALLBACK = 'Lý do không hợp lệ, vui lòng kiểm tra lại';

export function reasonServerError(error: unknown): string | null {
  if (!isAxiosError(error)) return null;
  const body = error.response?.data as
    | { error?: { code?: unknown; details?: unknown } }
    | undefined;
  if (body?.error?.code !== 'VAL_001') return null;

  const details = body.error.details;
  if (details === null || typeof details !== 'object' || Array.isArray(details)) return null;
  if (!('reason' in details)) return null;

  const raw = (details as { reason: unknown }).reason;
  const first = Array.isArray(raw) ? raw[0] : raw;
  return typeof first === 'string' && first.trim() !== ''
    ? first.trim()
    : REASON_SERVER_ERROR_FALLBACK;
}

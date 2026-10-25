import type { AxiosError } from 'axios';

import { extractErrorCode, extractErrorDetails } from '@/core/api/error.handler';

/** Mã lỗi có giao diện riêng trong tab — KHÔNG toast chung. */
export const INLINE_TEMPLATE_ERRORS: ReadonlySet<string> = new Set([
  'RES_003',
  'VAL_001',
  'TPL_001',
]);

export const templateErrorCode = (err: unknown): string => extractErrorCode(err as AxiosError);

/** Trường form cấp 1 mà BE có thể báo lỗi (`details` của `VAL_001` là `flatten().fieldErrors` của Zod BE). */
export type TemplateFieldName = 'name' | 'description' | 'isActive' | 'channels';
const FIELDS: readonly TemplateFieldName[] = ['name', 'description', 'isActive', 'channels'];

/**
 * Đọc lỗi từng trường từ `details` của `VAL_001` — dạng `{ [trường]: string[] }`. Chỉ trường cấp 1 (BE không
 * chỉ ra hàng kênh nào lỗi), nên lỗi `channels` hiện ở cấp mảng, không gắn vào một hàng.
 * Trả `[]` khi `details` không đúng dạng (khi đó người gọi rơi về thông báo chung).
 */
export function serverFieldErrors(err: unknown): { field: TemplateFieldName; message: string }[] {
  const details = extractErrorDetails(err as AxiosError) as Record<string, unknown> | null;
  if (!details || typeof details !== 'object') return [];
  return FIELDS.flatMap((field) => {
    const raw = details[field];
    const message = Array.isArray(raw) ? raw[0] : raw;
    return typeof message === 'string' && message ? [{ field, message }] : [];
  });
}

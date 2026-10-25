import { isAxiosError } from 'axios';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

import { extractErrorMessage } from '@/core/api/error.handler';

import { errorCodeOf, errorStatusOf, serverFieldMessages } from './economy-errors';

/**
 * Gắn lỗi BE (`VAL_001` → `error.details` theo trường) vào ĐÚNG ô của form. `map`: tên trường BE → tên ô trong form (trường BE không có trong `map` bị bỏ qua —
 * toast chung của interceptor vẫn nói lỗi đó). `conflictField`: 409 KHÔNG phải `RES_003`/`RES_004` khi TẠO = trùng mã → gắn thông điệp của BE vào ô mã.
 * Trả `true` nếu đã gắn ít nhất một lỗi vào ô.
 */
export function applyServerErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  err: unknown,
  map: Record<string, Path<T>>,
  conflictField?: Path<T>,
): boolean {
  let applied = false;
  for (const [key, message] of Object.entries(serverFieldMessages(err))) {
    const field = map[key];
    if (field) {
      form.setError(field, { type: 'server', message });
      applied = true;
    }
  }
  const code = errorCodeOf(err);
  if (
    conflictField &&
    isAxiosError(err) &&
    errorStatusOf(err) === 409 &&
    code !== 'RES_003' &&
    code !== 'RES_004'
  ) {
    form.setError(conflictField, { type: 'server', message: extractErrorMessage(err) });
    applied = true;
  }
  return applied;
}

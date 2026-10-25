import type { z } from 'zod';

import { logger } from '@/shared/utils/logger';

/**
 * Parse phản hồi bằng schema Zod; hỏng thì ném `Error` tiếng Việt thay vì
 * `ZodError` (JSON các issue hiện nguyên lên toast/Alert — không ai đọc nổi).
 *
 * ⚠️ Vẫn để lộ `issues` ở console dev: không có nó thì "Dữ liệu ví không hợp
 * lệ" là ngõ cụt, không biết trường nào lệch hợp đồng với BE.
 */
export class WalletContractError extends Error {
  constructor(what: string) {
    super(`Dữ liệu ${what} không đúng định dạng. Vui lòng cập nhật ứng dụng hoặc thử lại.`);
    this.name = 'WalletContractError';
  }
}

export function parseView<TSchema extends z.ZodType>(
  schema: TSchema,
  data: unknown,
  what: string,
): z.output<TSchema> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  if (__DEV__) logger.warn(`[wallet] phản hồi ${what} lệch hợp đồng`, result.error.issues);
  throw new WalletContractError(what);
}

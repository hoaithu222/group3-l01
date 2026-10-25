import { z } from 'zod';

/**
 * Mảnh dựng chung của schema phản hồi ví (`wallet.schemas.ts`, `wallet-payments.schemas.ts`).
 * Tách riêng để hai file schema cùng dùng mà không import lẫn nhau.
 */

export const money = z.number().int();
export const isoDate = z.string().min(1);

export function nullable<T extends z.ZodType>(schema: T) {
  return schema.nullish().transform((value): z.output<T> | null => value ?? null);
}

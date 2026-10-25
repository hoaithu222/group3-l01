import { z } from 'zod';

import { COLUMN_KINDS } from '@/shared/constants/column-kinds';

import {
  COLUMN_TITLE_MAX,
  COLUMNS_MAX,
  COLUMNS_MIN,
  WIP_LIMIT_MAX,
  WIP_LIMIT_MIN,
} from '../constants/pm.constants';

const columnSchema = z.object({
  title: z.string().trim().min(1, 'Nhập tên cột').max(COLUMN_TITLE_MAX, `Tối đa ${COLUMN_TITLE_MAX} ký tự`),
  kind: z.enum(COLUMN_KINDS, { error: 'Chọn loại cột' }),
  /** Không có ô nhập ở admin — chỉ giữ nguyên giá trị mẫu đã lưu (nếu có). */
  wipLimit: z.number().int().min(WIP_LIMIT_MIN).max(WIP_LIMIT_MAX).nullable().optional(),
});

/**
 * Schema form "Cột mặc định khi tạo bảng" — GIỐNG schema `pm.defaultColumns` phía BE
 * (`be/src/core/config/system-config.registry.ts`): 2–`maxColumns` cột, tên 1–40 ký tự, ĐÚNG MỘT cột
 * Hoàn thành. Lỗi "đúng một cột Hoàn thành" gắn ở mảng `columns` (không thuộc ô nào).
 * `maxColumns` = trần hiện hành `limits.board.columnsMax` (≤ 12), nên mẫu không vượt được trần đó.
 */
export function buildDefaultColumnsSchema(maxColumns: number = COLUMNS_MAX) {
  return z.object({
    columns: z
      .array(columnSchema)
      .min(COLUMNS_MIN, `Cần ít nhất ${COLUMNS_MIN} cột`)
      .max(maxColumns, `Tối đa ${maxColumns} cột`)
      .refine(
        (cols) => cols.filter((c) => c.kind === 'DONE').length === 1,
        'Phải có đúng một cột Hoàn thành',
      ),
  });
}

export type DefaultColumnsFormValues = z.infer<ReturnType<typeof buildDefaultColumnsSchema>>;
export type DefaultColumnRow = DefaultColumnsFormValues['columns'][number];

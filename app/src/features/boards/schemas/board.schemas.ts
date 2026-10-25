import { z } from 'zod';

import type { CapabilityLimits } from '@/core/capabilities';

import { FALLBACK_BOARD_LIMITS } from '../constants/kanban.constants';

export type BoardLimits = { [K in keyof typeof FALLBACK_BOARD_LIMITS]: number };

/** `capabilities.limits.board` khai `unknown` cố ý (`capabilities.types.ts`) — ép kiểu tại đây, thiếu thì dùng trần cứng của BE. */
export function readBoardLimits(limits: CapabilityLimits | undefined): BoardLimits {
  const raw = limits?.board as Partial<BoardLimits> | undefined;
  return {
    columnTitleMax: raw?.columnTitleMax ?? FALLBACK_BOARD_LIMITS.columnTitleMax,
    columnsMax: raw?.columnsMax ?? FALLBACK_BOARD_LIMITS.columnsMax,
    labelsMax: raw?.labelsMax ?? FALLBACK_BOARD_LIMITS.labelsMax,
    nameMax: raw?.nameMax ?? FALLBACK_BOARD_LIMITS.nameMax,
  };
}

/** Mô tả tối đa 1000 ký tự — be.md §3 `createBoardSchema.description`. */
const DESCRIPTION_MAX = 1000;

export function boardFormSchema(limits: BoardLimits) {
  return z.object({
    description: z
      .string()
      .trim()
      .max(DESCRIPTION_MAX, `Mô tả tối đa ${DESCRIPTION_MAX} ký tự`)
      .optional(),
    name: z
      .string()
      .trim()
      .min(1, 'Nhập tên bảng')
      .max(limits.nameMax, `Tên bảng tối đa ${limits.nameMax} ký tự`),
  });
}

export type BoardFormValues = z.infer<ReturnType<typeof boardFormSchema>>;

export const labelFormSchema = z.object({
  color: z.string().min(1),
  name: z.string().trim().min(1, 'Nhập tên nhãn').max(30, 'Tên nhãn tối đa 30 ký tự'),
});

import { z } from 'zod';

import { graphemeLength } from '../utils/grapheme';

/**
 * Trường chuỗi dùng chung của hai schema portfolio (Thông tin, Sửa dự án). Schema Zod 4 khớp `dtos/portfolio.dto.ts` của BE (Zod 3 — đối chiếu bằng tay, không chép chéo) với giới hạn lấy từ
 * `capabilities.limits.portfolio` (`usePortfolioLimits`). Mọi ô là CHUỖI (bàn phím di động), `.trim()` ở đây chứ không ở ô nhập; độ dài đếm GRAPHEME như BE (`z.string().max` đếm code unit
 * nên chặt hơn với emoji). ⚠️ Chuỗi rỗng = "xoá" (BE nhận `null`): đổi ở `toSaveInput`/`toUpdateInput`, không đổi trong schema để `FormInput` giữ đúng chữ đang gõ.
 */
export const maxText = (max: number, message?: string) =>
  z
    .string()
    .trim()
    .refine((value) => graphemeLength(value) <= max, message ?? `Tối đa ${max} ký tự`);

import { z } from 'zod';

import { WB_UI_LIMITS } from '../constants/whiteboard.constants';

/**
 * Form Zod 4 của Bảng trắng — khớp DTO BE (`be/src/modules/whiteboards/dtos/whiteboard.dto.ts`), `.trim()` mọi chuỗi (bàn phím di động tự
 * chèn dấu cách sau gợi ý — `form-validation.md`). BE đếm tên theo KÝ TỰ HIỂN THỊ (grapheme), app đếm theo `length`: tên toàn emoji ghép có thể
 * qua mặt ở đây rồi bị BE từ chối — hiếm, và lỗi BE vẫn hiện trong tấm.
 */
const nameField = z
  .string()
  .trim()
  .min(1, 'Nhập tên bảng trắng')
  .max(WB_UI_LIMITS.nameMax, `Tên tối đa ${WB_UI_LIMITS.nameMax} ký tự`);

export const createWhiteboardSchema = z.object({
  name: nameField,
  visibility: z.enum(['WORKSPACE', 'PRIVATE']),
});
export type CreateWhiteboardValues = z.infer<typeof createWhiteboardSchema>;

export const renameWhiteboardSchema = z.object({ name: nameField });
export type RenameWhiteboardValues = z.infer<typeof renameWhiteboardSchema>;

/** Nhãn bản lưu thủ công: để trống được (BE lưu `null`). */
export const snapshotLabelSchema = z.object({
  label: z
    .string()
    .trim()
    .max(WB_UI_LIMITS.snapshotLabelMax, `Nhãn tối đa ${WB_UI_LIMITS.snapshotLabelMax} ký tự`),
});
export type SnapshotLabelValues = z.infer<typeof snapshotLabelSchema>;

/** Chữ trong phần tử `text`/`sticky` (engine cắt ở `WB_LIMITS.textMax` = 2000; ở đây chỉ chặn nhập quá tay). */
export const elementTextSchema = z.object({ text: z.string().max(2000, 'Tối đa 2000 ký tự') });
export type ElementTextValues = z.infer<typeof elementTextSchema>;

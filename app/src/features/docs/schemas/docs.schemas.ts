import { z } from 'zod';

import { DOCS_LIMITS } from '../constants/docs.constants';
import { normalizeLinkHref } from '../utils/link';

/**
 * Form Zod 4 của Real-time Docs — khớp DTO BE (`be/src/modules/documents/dtos/document.dto.ts`), `.trim()` mọi chuỗi (bàn phím di động
 * tự chèn dấu cách sau gợi ý — `form-validation.md`). BE đếm tiêu đề theo KÝ TỰ HIỂN THỊ (grapheme), app đếm theo `length`: tiêu đề toàn emoji
 * ghép có thể qua mặt ở đây rồi bị BE từ chối — hiếm, và lỗi BE vẫn hiện trong tấm.
 */
const titleField = z
  .string()
  .trim()
  .min(1, 'Nhập tiêu đề tài liệu')
  .max(DOCS_LIMITS.titleMax, `Tiêu đề tối đa ${DOCS_LIMITS.titleMax} ký tự`);

export const createDocumentSchema = z.object({
  title: titleField,
  visibility: z.enum(['WORKSPACE', 'PRIVATE']),
});
export type CreateDocumentValues = z.infer<typeof createDocumentSchema>;

export const renameDocumentSchema = z.object({ title: titleField });
export type RenameDocumentValues = z.infer<typeof renameDocumentSchema>;

/** Nhãn bản lưu thủ công: để trống được (BE lưu `null`). */
export const snapshotLabelSchema = z.object({
  label: z
    .string()
    .trim()
    .max(DOCS_LIMITS.snapshotLabelMax, `Nhãn tối đa ${DOCS_LIMITS.snapshotLabelMax} ký tự`),
});
export type SnapshotLabelValues = z.infer<typeof snapshotLabelSchema>;

/** Liên kết chèn vào tài liệu: http(s)/mailto/tel; `example.com` tự thêm `https://` (chuẩn hoá ở `normalizeLinkHref`). */
export const linkSchema = z.object({
  href: z
    .string()
    .trim()
    .min(1, 'Nhập địa chỉ liên kết')
    .refine((value) => normalizeLinkHref(value) !== null, {
      message: 'Liên kết không hợp lệ (chỉ hỗ trợ http, https, mailto, tel)',
    }),
});
export type LinkValues = z.infer<typeof linkSchema>;

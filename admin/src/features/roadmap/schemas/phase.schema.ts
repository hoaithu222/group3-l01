import { z } from 'zod';

import { requiredText } from '@/shared/utils/validation/validators.utils';

/**
 * Khớp `createPhaseSchema`/`patchPhaseSchema` (be.md §3: "title, summary?, stageLabel?, color?, capstone?").
 * be.md không nêu độ dài tối đa cho từng trường — dùng mức tương tự `RoadmapSubject` (title/label ngắn,
 * mô tả dài) cho nhất quán, không phải số BE thật.
 */
export const PHASE_TITLE_MAX = 120;
export const PHASE_SUMMARY_MAX = 2000;
export const PHASE_CAPSTONE_MAX = 5000;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export const phaseFormSchema = z.object({
  title: requiredText('Tiêu đề tháng là bắt buộc').max(PHASE_TITLE_MAX, `Tối đa ${PHASE_TITLE_MAX} ký tự`),
  summary: z.string().trim().max(PHASE_SUMMARY_MAX, `Tóm tắt tối đa ${PHASE_SUMMARY_MAX} ký tự`),
  stageLabel: z.string().trim().max(PHASE_TITLE_MAX, `Tối đa ${PHASE_TITLE_MAX} ký tự`),
  // `ColorPickerField` luôn trả hex hợp lệ (fallback cyan) — như `subject.schema.ts`, không mô hình `null`.
  color: z.string().regex(HEX_RE, 'Màu không hợp lệ'),
  capstone: z.string().trim().max(PHASE_CAPSTONE_MAX, `Dự án cuối tháng tối đa ${PHASE_CAPSTONE_MAX} ký tự`),
});
export type PhaseFormValues = z.infer<typeof phaseFormSchema>;

/** Form thu gọn cho "+ Thêm tháng" — chỉ hỏi tiêu đề, phần còn lại sửa sau trong `PhasePanel`. */
export const createPhaseQuickSchema = z.object({
  title: requiredText('Tiêu đề tháng là bắt buộc').max(PHASE_TITLE_MAX, `Tối đa ${PHASE_TITLE_MAX} ký tự`),
});
export type CreatePhaseQuickValues = z.infer<typeof createPhaseQuickSchema>;

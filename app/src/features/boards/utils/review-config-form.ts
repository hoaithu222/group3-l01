import type { PutReviewConfigPayload, ReviewConfigDto } from '../api/reviews.types';
import { reviewConfigSchema, type ReviewLimits } from '../schemas/review.schemas';
import { toRubricInputs, type RubricDraft } from './rubric-draft';

/** Giá trị đang sửa của form cấu hình chấm chéo (màn Cài đặt chấm chéo). */
export interface ReviewConfigForm {
  drafts: readonly RubricDraft[];
  enabled: boolean;
  requiredReviews: number;
}

/**
 * Lỗi đầu tiên (câu tiếng Việt) hoặc `null` nếu hợp lệ — cùng luật `boardReviewConfigSchema` phía BE (Zod ở app/BE khác phiên bản nên
 * đối chiếu bằng tay, không chép chéo). `maxScore` là chuỗi trong nháp: ô trống → `NaN` → "Điểm tối đa phải là số nguyên".
 */
export function validateReviewConfig(form: ReviewConfigForm, limits: ReviewLimits): string | null {
  const result = reviewConfigSchema(limits).safeParse({
    autoCompleteOnApproval: false,
    enabled: form.enabled,
    requiredReviews: form.requiredReviews,
    rubric: form.drafts.map((draft) => ({
      description: draft.description,
      label: draft.label,
      maxScore: draft.maxScore.trim() === '' ? Number.NaN : Number(draft.maxScore),
    })),
  });
  return result.success ? null : (result.error.issues[0]?.message ?? 'Cấu hình chưa hợp lệ');
}

/**
 * Thân `PUT /boards/:id/review-config` (ghi ĐÈ toàn bộ cấu hình + CAS `expectedVersion`). Hai trường màn này KHÔNG có ô sửa
 * (`reviewerPool`, `autoCompleteOnApproval` — P1) được GIỮ NGUYÊN theo giá trị server, không bị lặng lẽ đặt lại.
 */
export function buildConfigPayload(config: ReviewConfigDto, form: ReviewConfigForm): PutReviewConfigPayload {
  return {
    autoCompleteOnApproval: config.autoCompleteOnApproval,
    enabled: form.enabled,
    expectedVersion: config.version,
    requiredReviews: form.requiredReviews,
    rubric: toRubricInputs(form.drafts),
    ...(config.reviewerPool ? { reviewerPool: config.reviewerPool } : {}),
  };
}

/**
 * `400 REVIEW_004 { rubric?: string[], reviewerPool?: string[] }` (BE `review-config.service.validate`) → câu lỗi đặt TẠI khối Tiêu chí,
 * phần còn lại (nhóm người chấm — chưa có ô sửa ở P0) gộp thành một câu chung. Chi tiết thiếu/sai hình dạng → cả hai `null` (nơi gọi dùng
 * câu mặc định của mã lỗi).
 */
export function configFieldErrors(details: Record<string, unknown> | undefined): { other: string | null; rubric: string | null } {
  const join = (value: unknown): string | null =>
    Array.isArray(value) && value.length > 0 ? value.filter((item) => typeof item === 'string').join(' · ') || null : null;
  return { other: join(details?.reviewerPool), rubric: join(details?.rubric) };
}

/** Có khác cấu hình đã lưu không — quyết định nút "Lưu" có bật. So từng tiêu chí theo thứ tự (đổi chỗ cũng là thay đổi). */
export function isConfigDirty(config: ReviewConfigDto, form: ReviewConfigForm): boolean {
  if (config.enabled !== form.enabled || config.requiredReviews !== form.requiredReviews) return true;
  if (config.rubric.length !== form.drafts.length) return true;
  return form.drafts.some((draft, index) => {
    const saved = config.rubric[index];
    return (
      !saved ||
      draft.id !== saved.id ||
      draft.label.trim() !== saved.label ||
      draft.description.trim() !== (saved.description ?? '') ||
      draft.maxScore.trim() !== String(saved.maxScore)
    );
  });
}

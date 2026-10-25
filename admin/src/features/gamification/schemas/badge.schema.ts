import { z } from 'zod';

import { requiredText } from '@/shared/utils/validation/validators.utils';

/** `LIMITS.badge` BE. */
export const BADGE_NAME_MAX = 60;
export const BADGE_DESCRIPTION_MAX = 300;
export const BADGE_CRITERIA_CLAUSES_MAX = 10;

const clauseSchema = z.object({
  counter: z.string().min(1, 'Chọn chỉ số'),
  value: z.number({ error: 'Nhập ngưỡng' }).int('Ngưỡng phải là số nguyên').min(1, 'Ngưỡng ≥ 1'),
});

/** `objectIdSchema` BE — id asset. */
const ASSET_ID_RE = /^[a-f0-9]{24}$/i;

/**
 * Ảnh huy hiệu = giá trị của `FileField` (`UploadedFile`) — `url` LÀ id asset chứ không phải URL: handler
 * `createAssetUploader` trả id (xem `core/uploads`). Asset đã READY (BE kiểm scope BADGE, chủ, chưa gắn → `ASSET_00x`);
 * `null` = không có ảnh (sửa: gỡ ảnh đang có → gửi `iconAssetId: null`).
 */
const iconSchema = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    url: z.string().regex(ASSET_ID_RE, 'Ảnh chưa tải xong, hãy đợi hoặc chọn lại'),
    size: z.number().optional(),
  })
  .nullable();

/**
 * Form tạo/sửa huy hiệu — khớp `badgeSchema`/`patchBadgeSchema` BE (`code` 3–40 a-z0-9-, tên 2–60,
 * mô tả ≤ 300, emoji ≤ 8, `iconAssetId` ObjectId, thứ tự 0–10 000, lý do 10–500). `criteria` BE kiểm lại (`GAME_002`).
 */
export const badgeFormSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{3,40}$/, 'Mã 3–40 ký tự a-z, 0-9, dấu gạch ngang'),
  name: requiredText('Tên là bắt buộc')
    .min(2, 'Tên tối thiểu 2 ký tự')
    .max(BADGE_NAME_MAX, `Tên tối đa ${BADGE_NAME_MAX} ký tự`),
  description: z
    .string()
    .trim()
    .max(BADGE_DESCRIPTION_MAX, `Mô tả tối đa ${BADGE_DESCRIPTION_MAX} ký tự`),
  emoji: z.string().trim().max(8, 'Emoji tối đa 8 ký tự'),
  icon: iconSchema,
  rarity: z.enum(['COMMON', 'RARE', 'EPIC', 'LEGENDARY']),
  order: z
    .number({ error: 'Nhập thứ tự' })
    .int('Thứ tự phải là số nguyên')
    .min(0, 'Thứ tự ≥ 0')
    .max(10_000, 'Thứ tự ≤ 10 000'),
  /** `criteria.all` — ≥ 1 điều kiện. */
  clauses: z
    .array(clauseSchema)
    .min(1, 'Cần ít nhất một điều kiện "Tất cả"')
    .max(BADGE_CRITERIA_CLAUSES_MAX, `Tối đa ${BADGE_CRITERIA_CLAUSES_MAX} điều kiện`),
  /** `criteria.any` — tuỳ chọn. */
  anyClauses: z
    .array(clauseSchema)
    .max(BADGE_CRITERIA_CLAUSES_MAX, `Tối đa ${BADGE_CRITERIA_CLAUSES_MAX} điều kiện`),
  reason: requiredText('Lý do là bắt buộc')
    .min(10, 'Lý do tối thiểu 10 ký tự')
    .max(500, 'Lý do tối đa 500 ký tự'),
});
export type BadgeFormValues = z.infer<typeof badgeFormSchema>;

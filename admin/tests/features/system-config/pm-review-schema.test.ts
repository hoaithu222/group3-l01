/**
 * Schema + tiện ích của thẻ "Chấm chéo — mặc định cho bảng mới" (`pm.review`, p4-05 admin.md §4): GIỐNG schema phía BE
 * (số lượt duyệt nguyên 1–trần, 1–3 mốc nhắc là số giờ nguyên 1–168 và tăng dần). Ô số của kit2 tự kẹp theo sàn/trần khi rời
 * ô, nên các ca ngoài khoảng kiểm thẳng ở tầng schema (lớp phòng thủ khi giá trị đến từ nguồn khác).
 */
import { describe, expect, it } from 'vitest';

import { buildReviewDefaultsSchema } from '@/features/system-config/pm/schemas/review-defaults.schema';
import {
  mergeReviewForm,
  requiredMaxOf,
  reviewPatch,
  summarizeReview,
  toReviewForm,
} from '@/features/system-config/pm/utils/review-defaults';
import type { SystemConfigItem } from '@/features/system-config/types/system-config.types';

const schema = buildReviewDefaultsSchema(5);
const valid = {
  enabledForNewBoards: true,
  requiredReviews: 2,
  reminders: [{ hours: 24 }, { hours: 72 }],
};

const messages = (input: unknown): string[] => {
  const r = schema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

const ITEM: SystemConfigItem = {
  key: 'pm.review',
  tab: 'pm',
  label: 'Chấm chéo (mặc định)',
  fields: [
    { path: 'enabledForNewBoards', label: 'Bật', kind: 'bool', default: false },
    { path: 'requiredReviews', label: 'Số lượt', kind: 'int', default: 2, floor: 1, ceil: 5 },
    { path: 'reminderHours', label: 'Nhắc', kind: 'json', default: [24, 72] },
  ],
  stored: {},
  effective: { enabledForNewBoards: false, requiredReviews: 2, reminderHours: [24, 72] },
  version: 1,
  updatedAt: null,
  updatedBy: null,
};

describe('reviewDefaultsSchema — kiểm tra', () => {
  it('giá trị hợp lệ (bật, 2 lượt, mốc 24/72) qua được', () => {
    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse({ ...valid, reminders: [{ hours: 1 }] }).success).toBe(true);
    expect(schema.safeParse({ ...valid, reminders: [{ hours: 1 }, { hours: 24 }, { hours: 168 }] }).success).toBe(true);
  });

  it('requiredReviews 0 hoặc 6 (trần 5) hoặc lẻ ⇒ lỗi tại trường', () => {
    expect(messages({ ...valid, requiredReviews: 0 })).toContain('Tối thiểu 1 lượt');
    expect(messages({ ...valid, requiredReviews: 6 })).toContain('Tối đa 5 lượt');
    expect(messages({ ...valid, requiredReviews: 2.5 })).toContain('Nhập số nguyên');
    expect(buildReviewDefaultsSchema(3).safeParse({ ...valid, requiredReviews: 4 }).success).toBe(false);
  });

  it('mốc nhắc giảm dần hoặc bằng nhau ⇒ "Các mốc nhắc phải tăng dần"', () => {
    expect(messages({ ...valid, reminders: [{ hours: 72 }, { hours: 24 }] })).toContain('Các mốc nhắc phải tăng dần');
    expect(messages({ ...valid, reminders: [{ hours: 24 }, { hours: 24 }] })).toContain('Các mốc nhắc phải tăng dần');
  });

  it('số mốc: 0 hoặc 4 ⇒ lỗi; mỗi mốc phải là số giờ nguyên 1–168', () => {
    expect(messages({ ...valid, reminders: [] })).toContain('Cần ít nhất một mốc nhắc');
    expect(
      messages({ ...valid, reminders: [{ hours: 1 }, { hours: 2 }, { hours: 3 }, { hours: 4 }] }),
    ).toContain('Tối đa 3 mốc nhắc');
    expect(messages({ ...valid, reminders: [{ hours: 0 }] })).toContain('Tối thiểu 1 giờ');
    expect(messages({ ...valid, reminders: [{ hours: 169 }] })).toContain('Tối đa 168 giờ');
    expect(messages({ ...valid, reminders: [{ hours: 1.5 }] })).toContain('Nhập số nguyên');
    expect(messages({ ...valid, reminders: [{ hours: Number.NaN }] })).toContain('Nhập một số');
  });
});

describe('tiện ích thẻ Chấm chéo', () => {
  it('toReviewForm: đọc giá trị hiệu lực; hỏng/thiếu ⇒ rơi về mặc định registry rồi mặc định cứng', () => {
    expect(toReviewForm(ITEM)).toEqual({
      enabledForNewBoards: false,
      requiredReviews: 2,
      reminders: [{ hours: 24 }, { hours: 72 }],
    });
    expect(
      toReviewForm({
        ...ITEM,
        effective: { enabledForNewBoards: true, requiredReviews: 4, reminderHours: [6, 30] },
      }),
    ).toEqual({ enabledForNewBoards: true, requiredReviews: 4, reminders: [{ hours: 6 }, { hours: 30 }] });
    // Mảng hỏng ("x") và số thiếu ⇒ mặc định của registry, không vỡ form.
    expect(toReviewForm({ ...ITEM, effective: { reminderHours: ['x'], requiredReviews: null } })).toEqual({
      enabledForNewBoards: false,
      requiredReviews: 2,
      reminders: [{ hours: 24 }, { hours: 72 }],
    });
    // Registry cũng thiếu ⇒ mặc định cứng của chấm chéo (tắt, 2 lượt, 24/72 giờ).
    expect(toReviewForm({ ...ITEM, fields: [], effective: {} })).toEqual({
      enabledForNewBoards: false,
      requiredReviews: 2,
      reminders: [{ hours: 24 }, { hours: 72 }],
    });
  });

  it('requiredMaxOf: lấy ceil do BE trả; thiếu ⇒ 5', () => {
    expect(requiredMaxOf(ITEM)).toBe(5);
    expect(
      requiredMaxOf({
        ...ITEM,
        fields: ITEM.fields.map((f) => (f.path === 'requiredReviews' ? { ...f, ceil: 3 } : f)),
      }),
    ).toBe(3);
    expect(requiredMaxOf({ ...ITEM, fields: [] })).toBe(5);
  });

  it('reviewPatch: dẹt mảng đối tượng thành reminderHours: number[]', () => {
    expect(reviewPatch(valid)).toEqual({
      enabledForNewBoards: true,
      requiredReviews: 2,
      reminderHours: [24, 72],
    });
  });

  it('mergeReviewForm + summarizeReview: ô đang gõ dở (trống) giữ giá trị server, mốc trống bị bỏ khỏi dòng so sánh', () => {
    const base = toReviewForm(ITEM);
    expect(summarizeReview(base)).toBe('Bảng mới tắt chấm chéo · 2 lượt duyệt · nhắc sau 24 / 72 giờ');
    const merged = mergeReviewForm(base, {
      enabledForNewBoards: true,
      requiredReviews: null,
      reminders: [{ hours: 12 }, { hours: null }, undefined],
    });
    expect(merged).toEqual({ enabledForNewBoards: true, requiredReviews: 2, reminders: [{ hours: 12 }] });
    expect(summarizeReview(merged)).toBe('Bảng mới bật chấm chéo · 2 lượt duyệt · nhắc sau 12 giờ');
    expect(mergeReviewForm(base, undefined)).toEqual(base);
  });
});

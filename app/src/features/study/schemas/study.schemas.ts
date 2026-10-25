import { z } from 'zod';

import type { CapabilityLimits } from '@/core/capabilities';

import { FALLBACK_STUDY_LIMITS, type StudyLimits } from '../constants/study.constants';

/** `capabilities.limits.study` khai `unknown` cố ý (`capabilities.types.ts`) — ép kiểu tại đây, thiếu thì dùng trần cứng của BE. */
export function readStudyLimits(limits: CapabilityLimits | undefined): StudyLimits {
  const raw = limits?.study as Partial<StudyLimits> | undefined;
  const result = { ...FALLBACK_STUDY_LIMITS } as StudyLimits;
  (Object.keys(FALLBACK_STUDY_LIMITS) as (keyof StudyLimits)[]).forEach((key) => {
    const value = raw?.[key];
    if (typeof value === 'number' && value > 0) result[key] = value;
  });
  return result;
}

/** Tách chuỗi "toán, hình học ; lớp 9" thành danh sách thẻ sạch: cắt khoảng trắng, bỏ rỗng, khử trùng (không phân biệt hoa/thường). */
export function parseTags(text: string, limits: Pick<StudyLimits, 'tagMax' | 'tagsMax'>): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of text.split(/[,;\n]/)) {
    const tag = raw.trim().slice(0, limits.tagMax);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags.slice(0, limits.tagsMax);
}

export function setFormSchema(limits: StudyLimits) {
  return z.object({
    description: z
      .string()
      .trim()
      .max(limits.setDescriptionMax, `Mô tả tối đa ${limits.setDescriptionMax} ký tự`)
      .optional(),
    tags: z.string().optional(),
    title: z
      .string()
      .trim()
      .min(1, 'Nhập tiêu đề bộ học')
      .max(limits.setTitleMax, `Tiêu đề tối đa ${limits.setTitleMax} ký tự`),
  });
}

export type SetFormValues = z.infer<ReturnType<typeof setFormSchema>>;

import { z } from 'zod';

import { requiredText } from '@/shared/utils/validation/validators.utils';

/**
 * Một mục trong `RoadmapLesson.resources[]` (be.md §2 `type RoadmapResource`, §9 `resourcesPerLessonMax:
 * 60`, `noteMax: 2000`). Không có endpoint riêng — mảng này gửi nguyên trong `patchLessonSchema.resources`.
 * Validation theo `kind`: LINK/VIDEO/TOOL cần `url`; FILE cần tệp PDF đã tải (`file`); NOTE cần `bodyMd`.
 */
export const RESOURCE_TITLE_MAX = 200;
export const RESOURCE_GROUP_MAX = 60;
export const RESOURCE_NOTE_MAX = 2000;
export const RESOURCES_MAX = 60;

export const RESOURCE_KIND_OPTIONS = [
  { value: 'LINK', label: 'Liên kết' },
  { value: 'VIDEO', label: 'Video' },
  { value: 'TOOL', label: 'Công cụ' },
  { value: 'FILE', label: 'Tệp (PDF)' },
  { value: 'NOTE', label: 'Ghi chú (cheatsheet)' },
];

export const RESOURCE_GROUP_SUGGESTIONS = [
  'Tài liệu chính thức',
  'Video',
  'Công cụ',
  'Nâng cao',
] as const;

/** Value của `FileField` (tệp PDF) — `url` LÀ id asset (xem `useRoadmapImageUpload`), không phải URL tải. */
const resourceFileSchema = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    url: z.string().regex(/^[a-f0-9]{24}$/i, 'Tệp chưa tải xong, hãy đợi hoặc chọn lại'),
    size: z.number().optional(),
  })
  .nullable();

function isValidHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const baseResourceSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['LINK', 'VIDEO', 'TOOL', 'FILE', 'NOTE']),
  group: z.string().trim().max(RESOURCE_GROUP_MAX, `Nhóm tối đa ${RESOURCE_GROUP_MAX} ký tự`),
  title: requiredText('Tiêu đề là bắt buộc').max(RESOURCE_TITLE_MAX, `Tối đa ${RESOURCE_TITLE_MAX} ký tự`),
  url: z.string().trim().max(2048, 'URL tối đa 2048 ký tự'),
  file: resourceFileSchema,
  note: z.string().trim().max(RESOURCE_NOTE_MAX, `Ghi chú tối đa ${RESOURCE_NOTE_MAX} ký tự`),
  bodyMd: z.string().trim().max(RESOURCE_NOTE_MAX, `Nội dung tối đa ${RESOURCE_NOTE_MAX} ký tự`),
  order: z.number(),
});

export const resourceSchema = baseResourceSchema.superRefine((v, ctx) => {
  if (v.kind === 'LINK' || v.kind === 'VIDEO' || v.kind === 'TOOL') {
    if (!v.url) ctx.addIssue({ code: 'custom', path: ['url'], message: 'Cần URL cho loại tài liệu này' });
    else if (!isValidHttpUrl(v.url)) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: 'URL không hợp lệ' });
    }
  }
  if (v.kind === 'FILE' && !v.file) {
    ctx.addIssue({ code: 'custom', path: ['file'], message: 'Cần tải tệp PDF' });
  }
  if (v.kind === 'NOTE' && !v.bodyMd.trim()) {
    ctx.addIssue({ code: 'custom', path: ['bodyMd'], message: 'Cần nội dung ghi chú' });
  }
});
export type ResourceFormValues = z.infer<typeof baseResourceSchema>;

/** Id mới cho một tài liệu vừa thêm ở client — khớp thẩm mỹ "r_" + 8 ký tự của BE (be.md §2), không bắt buộc trùng thuật toán. */
export function newResourceId(): string {
  const rand = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`;
  return `r_${rand.replace(/-/g, '').slice(0, 8)}`;
}

export function emptyResource(order: number): ResourceFormValues {
  return {
    id: newResourceId(),
    kind: 'LINK',
    group: '',
    title: '',
    url: '',
    file: null,
    note: '',
    bodyMd: '',
    order,
  };
}

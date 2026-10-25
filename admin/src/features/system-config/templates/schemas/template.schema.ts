import { z } from 'zod';

import { normalizeSearch } from '@/shared/utils/format/string.utils';

import {
  CHANNEL_DESCRIPTION_MAX,
  CHANNEL_KEY_MAX,
  CHANNEL_KEY_PATTERN,
  CHANNEL_NAME_MAX,
  CHANNEL_NAME_MIN,
  CHANNELS_MAX,
  CHANNELS_MIN,
  RESERVED_CHANNEL_NAME,
  TEMPLATE_DESCRIPTION_MAX,
  TEMPLATE_NAME_MAX,
  TEMPLATE_NAME_MIN,
} from '../constants/templates.constants';
import { graphemeLength } from '../utils/template-text';

/** Tên (đã trim) trong khoảng [min, max] ký tự HIỂN THỊ — đếm grapheme như BE (`graphemeLength`). */
const graphemeBetween = (min: number, max: number) => (value: string) => {
  const length = graphemeLength(value);
  return length >= min && length <= max;
};

const channelSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'Nhập khoá kênh')
    .max(CHANNEL_KEY_MAX, `Tối đa ${CHANNEL_KEY_MAX} ký tự`)
    .regex(CHANNEL_KEY_PATTERN, 'Khoá chỉ gồm a-z, 0-9 và dấu gạch ngang'),
  name: z
    .string()
    .trim()
    .min(1, 'Nhập tên kênh')
    .refine(
      graphemeBetween(CHANNEL_NAME_MIN, CHANNEL_NAME_MAX),
      `Tên kênh ${CHANNEL_NAME_MIN}–${CHANNEL_NAME_MAX} ký tự`,
    ),
  description: z
    .string()
    .trim()
    .max(CHANNEL_DESCRIPTION_MAX, `Tối đa ${CHANNEL_DESCRIPTION_MAX} ký tự`),
  type: z.enum(['TEXT', 'VOICE', 'POMODORO'], { error: 'Chọn loại kênh' }),
  visibility: z.enum(['PUBLIC', 'PRIVATE'], { error: 'Chọn kiểu hiển thị' }),
  postingPolicy: z.enum(['MEMBERS', 'ADMINS_ONLY'], { error: 'Chọn chính sách đăng' }),
  defaultSelected: z.boolean(),
});

/** Đóng gói kiểm chéo giữa các hàng — cùng luật với BE (`templateChannelsSchema`): khoá/tên không trùng, không có "Chung". */
const channelsSchema = z
  .array(channelSchema)
  .min(CHANNELS_MIN, `Mẫu cần ít nhất ${CHANNELS_MIN} kênh`)
  .max(CHANNELS_MAX, `Mẫu tối đa ${CHANNELS_MAX} kênh`)
  .superRefine((channels, ctx) => {
    const keys = new Set<string>();
    const names = new Set<string>();
    channels.forEach((channel, index) => {
      const key = channel.key.trim();
      if (key && keys.has(key)) {
        ctx.addIssue({ code: 'custom', path: [index, 'key'], message: 'Khoá kênh bị trùng' });
      }
      keys.add(key);

      // "Frontend" ≡ "frontend " ≡ "FRONTEND" — so khớp sau chuẩn hoá bỏ dấu, như BE.
      const normalized = normalizeSearch(channel.name);
      if (!normalized) return;
      if (normalized === RESERVED_CHANNEL_NAME) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'name'],
          message: 'Không dùng tên "Chung" — kênh mặc định tự tạo cùng nhóm',
        });
      } else if (names.has(normalized)) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'name'],
          message: 'Tên kênh bị trùng trong mẫu',
        });
      }
      names.add(normalized);
    });
  });

/** Schema form sửa mẫu — GIỐNG `adminUpdateTemplateSchema` phía BE (Zod v3), trừ `expectedVersion`/`reason` (hộp thoại lý do lo). */
export const templateFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Nhập tên mẫu')
    .refine(
      graphemeBetween(TEMPLATE_NAME_MIN, TEMPLATE_NAME_MAX),
      `Tên mẫu ${TEMPLATE_NAME_MIN}–${TEMPLATE_NAME_MAX} ký tự`,
    ),
  description: z
    .string()
    .trim()
    .max(TEMPLATE_DESCRIPTION_MAX, `Tối đa ${TEMPLATE_DESCRIPTION_MAX} ký tự`),
  isActive: z.boolean(),
  channels: channelsSchema,
});

export type TemplateFormValues = z.infer<typeof templateFormSchema>;
export type TemplateChannelValues = TemplateFormValues['channels'][number];

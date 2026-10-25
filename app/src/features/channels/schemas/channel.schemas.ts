import { z } from 'zod';

import type { CapabilityLimits } from '@/core/capabilities';

/**
 * Trần cứng phía BE (`LIMITS.channel`, be.md p1-03 §9) — dùng khi `capabilities`
 * chưa tải xong. `nameMin/nameMax/descriptionMax` không nằm trong be.md §9 (chỉ
 * liệt `initialMembersMax`/`grantBatchMax`/…) nên lấy từ `be/src/core/constants/limits.ts`
 * (đọc trực tiếp, không sửa) — 2/60/500, khớp be.md §3 (`channelName` 2–60).
 */
const FALLBACK_CHANNEL_LIMITS = { nameMin: 2, nameMax: 60, descriptionMax: 500, initialMembersMax: 100 };

export function readChannelLimits(limits: CapabilityLimits | undefined): typeof FALLBACK_CHANNEL_LIMITS {
  const raw = limits?.channel as Partial<typeof FALLBACK_CHANNEL_LIMITS> | undefined;
  return {
    nameMin: raw?.nameMin ?? FALLBACK_CHANNEL_LIMITS.nameMin,
    nameMax: raw?.nameMax ?? FALLBACK_CHANNEL_LIMITS.nameMax,
    descriptionMax: raw?.descriptionMax ?? FALLBACK_CHANNEL_LIMITS.descriptionMax,
    initialMembersMax: raw?.initialMembersMax ?? FALLBACK_CHANNEL_LIMITS.initialMembersMax,
  };
}

/**
 * ⚠️ Đếm bằng ĐỘ DÀI CHUỖI thường (`.min`/`.max` của Zod), KHÔNG đếm grapheme
 * thật (be.md §3 dùng `graphemeLength`). Cùng đơn giản hoá mà p1-01 đã chọn
 * cho `createWorkspaceSchema` — BE vẫn là nguồn xác nhận cuối (`CH_002` hiện ra
 * nếu client tính sai ở đúng ranh giới emoji ghép), và app chưa có tiện ích
 * đếm grapheme dùng chung để tránh viết trùng logic mỗi feature.
 */
export function channelNameSchema(limits: ReturnType<typeof readChannelLimits>) {
  return z
    .string()
    .trim()
    .min(limits.nameMin, `Tên kênh tối thiểu ${limits.nameMin} ký tự`)
    .max(limits.nameMax, `Tên kênh tối đa ${limits.nameMax} ký tự`);
}

export function channelDescriptionSchema(limits: ReturnType<typeof readChannelLimits>) {
  return z.string().trim().max(limits.descriptionMax, `Mô tả tối đa ${limits.descriptionMax} ký tự`);
}

/** Form "Quản lý" của `ChannelInfoScreen` (app.md §3) — cùng hai trường của `NameStep`. */
export function updateChannelFormSchema(limits: ReturnType<typeof readChannelLimits>) {
  return z.object({
    name: channelNameSchema(limits),
    description: channelDescriptionSchema(limits).optional(),
  });
}

export type UpdateChannelFormValues = z.infer<ReturnType<typeof updateChannelFormSchema>>;

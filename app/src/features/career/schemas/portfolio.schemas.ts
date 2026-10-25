import { z } from 'zod';

import type { Portfolio, SavePortfolioInput } from '../api/portfolio.types';
import type { PortfolioLimits } from '../constants/portfolio.constants';
import { graphemeLength } from '../utils/grapheme';
import { maxText } from './portfolio-fields';

/** `https://` + máy chủ KHÔNG có tài khoản (`@`) — khớp `safeHttpsUrl` của BE (`javascript:`/`data:`/`http:` bị BỎ khỏi trang công khai, CR-33). */
const HTTPS_URL = /^https:\/\/[^\s/?#@]+(?:[/?#]\S*)?$/i;

const linkSchema = (limits: PortfolioLimits) =>
  z.object({
    label: z
      .string()
      .trim()
      .min(1, 'Nhập tên liên kết')
      .max(limits.linkLabelMax, `Tối đa ${limits.linkLabelMax} ký tự`),
    url: z
      .string()
      .trim()
      .max(limits.linkUrlMax, `Tối đa ${limits.linkUrlMax} ký tự`)
      .regex(HTTPS_URL, 'Liên kết phải là địa chỉ https:// hợp lệ'),
  });

/** Form "Thông tin" (app.md p6-07 §3) — khớp `updatePortfolioSchema` của BE cho phần tên/tiêu đề/giới thiệu/ảnh/liên kết. Mẫu, mục và SEO nằm ở màn Giao diện. */
export function profileSchema(limits: PortfolioLimits) {
  return z.object({
    avatarAssetId: z.string().nullable(),
    bio: maxText(limits.bioMax),
    displayName: maxText(limits.displayNameMax).refine(
      (value) => graphemeLength(value) >= limits.displayNameMin,
      `Tên hiển thị tối thiểu ${limits.displayNameMin} ký tự`,
    ),
    headline: maxText(limits.headlineMax),
    links: z.array(linkSchema(limits)).max(limits.linksMax, `Tối đa ${limits.linksMax} liên kết`),
  });
}

export type ProfileFormValues = z.infer<ReturnType<typeof profileSchema>>;

/** Lấy hình dạng ĐẦY ĐỦ của thân `PUT /me/portfolio` (BE `.strict()`): phần không nằm trong form (mẫu, mục, SEO) lấy từ hồ sơ hiện có/mặc định. */
export function toSaveInput(
  values: ProfileFormValues,
  rest: Pick<SavePortfolioInput, 'theme' | 'sections' | 'seoIndexable'>,
  expectedVersion: number,
): SavePortfolioInput {
  return {
    ...rest,
    avatarAssetId: values.avatarAssetId,
    bio: values.bio === '' ? null : values.bio,
    displayName: values.displayName,
    expectedVersion,
    headline: values.headline === '' ? null : values.headline,
    links: values.links.map((link) => ({ label: link.label, url: link.url })),
  };
}

export function profileDefaults(
  portfolio: Portfolio | null,
  fallbackName: string,
): ProfileFormValues {
  return {
    avatarAssetId: portfolio?.avatarAssetId ?? null,
    bio: portfolio?.bio ?? '',
    displayName: portfolio?.displayName ?? fallbackName,
    headline: portfolio?.headline ?? '',
    links: portfolio?.links.map((link) => ({ label: link.label, url: link.url })) ?? [],
  };
}

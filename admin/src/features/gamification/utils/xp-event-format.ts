import { formatNumber } from '@/shared/utils/format';

import { XP_BLOCKED_REASON_LABELS, XP_SOURCE_LABELS } from '../constants/gamification.labels';

/**
 * Nhãn + mô tả của một nguồn XP. Nguồn BE thêm về sau (chưa có trong bảng nhãn) vẫn ra MỘT dòng đọc được — hiện nguyên mã — thay vì
 * `undefined.label` làm sập cả trang (đã xảy ra với `ROADMAP_LESSON`). `hasOwnProperty` để mã lạ như `constructor` không lọt vào nguyên mẫu.
 */
export function xpSourceMeta(sourceType: string): { label: string; hint: string } {
  return Object.prototype.hasOwnProperty.call(XP_SOURCE_LABELS, sourceType)
    ? XP_SOURCE_LABELS[sourceType as keyof typeof XP_SOURCE_LABELS]
    : { label: sourceType, hint: 'Nguồn XP mới — chưa có nhãn tiếng Việt' };
}

/** Lý do bị chặn đọc được; mã chưa biết → "lý do khác" (không lộ mã thô, không vỡ khi tra khoá `constructor`). */
export function xpBlockedReasonLabel(reason: string): string {
  return Object.prototype.hasOwnProperty.call(XP_BLOCKED_REASON_LABELS, reason)
    ? XP_BLOCKED_REASON_LABELS[reason]
    : 'lý do khác';
}

/** XP có dấu và phân tách hàng nghìn: `+1.250`, `-50`, `0`. */
export const formatXpDelta = (xp: number): string => (xp > 0 ? `+${formatNumber(xp)}` : formatNumber(xp));

import { isAxiosError } from 'axios';

import type { ApiErrorBody } from '@/core/api/client.types';
import { formatNumber } from '@/shared/utils/format/currency.utils';

import type { MyGamificationDto } from '../api/gamification.types';
import { GAMIFICATION_ERROR_MESSAGES } from '../constants/gamification.constants';

/**
 * Phần trăm tiến độ lên cấp từ `xpIntoLevel`/`xpToNext` do SERVER tính — client không tự tính ngưỡng (app.md §2).
 * `xpToNext = 0` (cấp tối đa) ⇒ 100 %.
 */
export function levelPercent(profile: Pick<MyGamificationDto, 'xpIntoLevel' | 'xpToNext'>): number {
  const { xpIntoLevel, xpToNext } = profile;
  if (xpToNext <= 0) return 100;
  const total = xpIntoLevel + xpToNext;
  return total > 0 ? Math.min(100, Math.max(0, (xpIntoLevel / total) * 100)) : 0;
}

/** Câu tiếng Việt cho lỗi của feature (`GAME_*`), rơi về thông điệp chung. */
export function gamificationErrorMessage(error: unknown, fallback: string): string {
  if (!isAxiosError(error)) return fallback;
  const code = (error.response?.data as ApiErrorBody | undefined)?.error?.code;
  return (code ? GAMIFICATION_ERROR_MESSAGES[code] : undefined) ?? fallback;
}

/** 404/403 — không có quyền / cờ tắt (không lộ nhóm có tồn tại). */
export function isAccessDenied(error: unknown): boolean {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  return status === 404 || status === 403;
}

/** ⛔ Không `Intl.NumberFormat`/`toLocaleString`: dữ liệu ICU của Hermes khác nhau giữa Android và iOS — `formatNumber` cố định dấu chấm. */
export const formatXp = (xp: number): string => formatNumber(xp, { unit: 'XP' });

/** "Còn 450 XP để lên cấp 13" / "Bạn đã đạt cấp cao nhất" — MỘT câu cho khối cấp màn Thành tích và thẻ Trang chủ. */
export function levelCaption(profile: Pick<MyGamificationDto, 'level' | 'xpToNext'>): string {
  return profile.xpToNext <= 0
    ? 'Bạn đã đạt cấp cao nhất'
    : `Còn ${formatXp(profile.xpToNext)} để lên cấp ${profile.level + 1}`;
}

/** Nhãn cấp cho `AnimatedNumber` (số trung gian làm tròn — không hiện "Cấp 11,4"). */
export const levelLabel = (level: number): string => `Cấp ${Math.round(level)}`;

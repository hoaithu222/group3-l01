import { ICON_NAMES, type IconName } from '@/shared/ui/icon';
import { formatNumber } from '@/shared/utils/format/currency.utils';

import type { SkillCategory } from './skill-badge.types';

/** Nhãn nhóm kỹ năng (enum `SkillCategory` BE). */
export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  FRONTEND: 'Frontend',
  BACKEND: 'Backend',
  MOBILE: 'Di động',
  DATA: 'Dữ liệu',
  DESIGN: 'Thiết kế',
  DEVOPS: 'DevOps',
  QA: 'Kiểm thử',
  SOFT: 'Kỹ năng mềm',
};

/** Icon mặc định khi `SkillDefinition.icon` không có trong bộ icon (vận hành gõ tên lạ / bộ icon đổi). */
export const DEFAULT_SKILL_ICON: IconName = 'star';

const KNOWN = new Set<string>(ICON_NAMES);

/** ⛔ Đừng ép `icon as IconName`: tên lạ làm `<Icon>` vẽ ô trống mà không báo lỗi. */
export function skillIconName(icon: string): IconName {
  return KNOWN.has(icon) ? (icon as IconName) : DEFAULT_SKILL_ICON;
}

/** Điểm thang 10 một chữ số thập phân kiểu Việt: 8,2 · 10 · `null` ⇒ "—". */
export function formatScore(value: number | null): string {
  if (value === null) return '—';
  return formatNumber(value, { decimals: Number.isInteger(value) ? 0 : 1 });
}

/** Story points (có thể lẻ ,5 khi chia cho nhiều người làm). */
export function formatPoints(value: number): string {
  return formatNumber(value, { decimals: Number.isInteger(value) ? 0 : 1 });
}

import { formatDate } from '@/shared/utils/format/date.utils';

import type { BadgeDto, CriteriaProgressDto } from '../api/gamification.types';
import { COUNTER_LABELS, RARITY_LABELS } from '../constants/gamification.constants';

/** "Công việc hoàn thành: 32/50" — chữ, không chỉ thanh mờ (app.md p4-03 §7). */
export function clauseText(clause: CriteriaProgressDto): string {
  const label = COUNTER_LABELS[clause.counter] ?? clause.counter;
  return `${label}: ${Math.min(clause.current, clause.target)}/${clause.target}`;
}

/** Trạng thái một dòng của ô huy hiệu: "Đạt ngày 21/09/2026" hoặc "Chưa đạt · Công việc hoàn thành: 32/50". */
export function badgeStatusText(badge: BadgeDto): string {
  if (badge.unlockedAt) return `Đạt ngày ${formatDate(badge.unlockedAt)}`;
  const first = badge.progress?.[0];
  if (!first) return 'Chưa đạt';
  return `Chưa đạt · ${Math.min(first.current, first.target)}/${first.target}`;
}

/**
 * Câu trợ năng của một ô huy hiệu (hàng hay lưới — CÙNG một câu, test bám vào nó): "Tên, Độ hiếm, trạng thái[, đang/chưa
 * trưng bày]". Độ hiếm và trạng thái nằm ở CHỮ — màu nền ô chỉ là điểm nhấn.
 */
export function badgeTileLabel(
  badge: BadgeDto,
  { selectable, selected }: { selectable: boolean; selected: boolean },
): string {
  const showcase =
    selectable && badge.unlockedAt ? (selected ? ', đang trưng bày' : ', chưa trưng bày') : '';
  return `${badge.name}, ${RARITY_LABELS[badge.rarity]}, ${badgeStatusText(badge)}${showcase}`;
}

import { formatPoints, formatScore } from '@/shared/career';

import type { SkillCatalogItem, SkillCriteria } from '../api/career.types';

/** Trạng thái một kỹ năng CỦA TÔI bằng CHỮ (không chỉ màu — app.md p6-06 §7). */
export type SkillStatus = 'achieved' | 'revoked' | 'progressing';

export function skillStatus(item: Pick<SkillCatalogItem, 'myBadge'>): SkillStatus {
  if (item.myBadge?.revoked) return 'revoked';
  if (item.myBadge) return 'achieved';
  return 'progressing';
}

export const SKILL_STATUS_LABELS: Record<SkillStatus, string> = {
  achieved: 'Đã đạt',
  revoked: 'Đã bị thu hồi',
  progressing: 'Đang tiến bộ',
};

/** "50 task Done gắn nhãn ReactJS · ≥ 60 điểm · điểm review TB ≥ 8 · qua review" — tiêu chí dạng danh sách chữ. */
export function criteriaLines(skillName: string, c: SkillCriteria): string[] {
  const lines = [`${String(c.requiredTasksDone)} task Done gắn nhãn ${skillName}`];
  if (c.minStoryPoints !== null) lines.push(`Tổng story points ≥ ${formatPoints(c.minStoryPoints)}`);
  if (c.minAvgPeerScore !== null) lines.push(`Điểm review trung bình ≥ ${formatScore(c.minAvgPeerScore)}`);
  if (c.requireReview) lines.push('Mọi task phải qua chấm chéo');
  return lines;
}

/** "Còn 12 task ReactJS · 3,5 điểm review" — câu tracker; đã đạt ⇒ `null`. */
export function remainingText(item: Pick<SkillCatalogItem, 'name' | 'myProgress'>): string | null {
  const r = item.myProgress.remaining;
  if (item.myProgress.achieved) return null;
  const parts: string[] = [];
  if (r.tasks > 0) parts.push(`${String(r.tasks)} task ${item.name}`);
  if (r.storyPoints > 0) parts.push(`${formatPoints(r.storyPoints)} story points`);
  if (r.peerScore > 0) parts.push(`${formatScore(r.peerScore)} điểm review`);
  if (r.reviewedTasks > 0 && r.tasks === 0) parts.push(`${String(r.reviewedTasks)} task qua chấm chéo`);
  return parts.length > 0 ? `Còn ${parts.join(' · ')}` : 'Sắp đạt — chờ hệ thống ghi nhận';
}

/** Mức gần đạt (0–1) theo số task — xếp "3 kỹ năng gần đạt nhất" ở tracker. */
export function closeness(item: Pick<SkillCatalogItem, 'criteria' | 'myProgress'>): number {
  const target = item.criteria.requiredTasksDone;
  return target > 0 ? Math.min(1, item.myProgress.tasksDone / target) : 0;
}

import { formatNumber } from '@/shared/utils/format';

import type { SkillFormValues } from '../schemas/skill.schema';
import type {
  AdminSkill,
  CreateSkillPayload,
  SkillCriteria,
  SkillPayloadBase,
} from '../types/skill.types';
import { parseLabels } from './skill-labels';

/** Giá trị đầu của form: bản mới → mặc định an toàn; sửa → từ kỹ năng đang lưu (ngưỡng `null` hiện là 0 = không áp dụng). */
export function initValues(skill: AdminSkill | null): SkillFormValues {
  if (!skill) {
    return {
      code: '',
      name: '',
      description: '',
      category: 'FRONTEND',
      labels: '',
      requiredTasksDone: 30,
      minStoryPoints: 0,
      minAvgPeerScore: 0,
      requireReview: false,
      icon: 'keyboard',
      order: 0,
      reason: '',
    };
  }
  return {
    code: skill.code,
    name: skill.name,
    description: skill.description ?? '',
    category: skill.category,
    labels: skill.labelMatch.join(', '),
    requiredTasksDone: skill.criteria.requiredTasksDone,
    minStoryPoints: skill.criteria.minStoryPoints ?? 0,
    minAvgPeerScore: skill.criteria.minAvgPeerScore ?? 0,
    requireReview: skill.criteria.requireReview,
    icon: skill.icon,
    order: skill.order,
    reason: '',
  };
}

type CriteriaInput = Pick<
  SkillFormValues,
  'requiredTasksDone' | 'minStoryPoints' | 'minAvgPeerScore' | 'requireReview'
>;

/** Tiêu chí gửi BE — 0 ở ngưỡng tuỳ chọn ⇒ `null` (không áp dụng). */
export function toCriteria(v: CriteriaInput): SkillCriteria {
  return {
    requiredTasksDone: v.requiredTasksDone,
    minStoryPoints: v.minStoryPoints > 0 ? v.minStoryPoints : null,
    minAvgPeerScore: v.minAvgPeerScore > 0 ? v.minAvgPeerScore : null,
    requireReview: v.requireReview,
  };
}

function toBase(v: SkillFormValues): SkillPayloadBase {
  return {
    name: v.name,
    description: v.description ? v.description : null,
    category: v.category,
    labelMatch: parseLabels(v.labels).raw,
    criteria: toCriteria(v),
    icon: v.icon,
    order: v.order,
  };
}

export function toCreatePayload(v: SkillFormValues): CreateSkillPayload {
  return { code: v.code, ...toBase(v) };
}

export function toUpdatePayload(skill: AdminSkill, v: SkillFormValues) {
  return {
    id: skill.id,
    expectedVersion: skill.version,
    ...(v.reason && { reason: v.reason }),
    ...toBase(v),
  };
}

const fmt = (n: number) => formatNumber(n, Number.isInteger(n) ? 0 : 1);

/** "50 task · ≥ 2,5 điểm · review TB ≥ 8,0 · qua review" — cột "Tiêu chí" và mô tả tiến độ. */
export function summarizeCriteria(c: SkillCriteria): string {
  const parts = [`${fmt(c.requiredTasksDone)} task`];
  if (c.minStoryPoints !== null) parts.push(`≥ ${fmt(c.minStoryPoints)} điểm`);
  if (c.minAvgPeerScore !== null) parts.push(`review TB ≥ ${formatNumber(c.minAvgPeerScore, 1)}`);
  if (c.requireReview) parts.push('qua review');
  return parts.join(' · ');
}

/** Tiêu chí mới KHÓ hơn bản đã lưu ở ít nhất một ngưỡng (khớp `isCriteriaHarder` BE) → Callout "không thu hồi huy hiệu đã cấp". */
export function isCriteriaHarder(prev: SkillCriteria, next: SkillCriteria): boolean {
  const up = (a: number | null, b: number | null) => (b ?? 0) > (a ?? 0);
  return (
    next.requiredTasksDone > prev.requiredTasksDone ||
    up(prev.minStoryPoints, next.minStoryPoints) ||
    up(prev.minAvgPeerScore, next.minAvgPeerScore) ||
    (next.requireReview && !prev.requireReview)
  );
}

import { memo } from 'react';

import { Badge, Button, Text } from '@/shared/ui';
import { formatDate, formatNumber } from '@/shared/utils/format';

import { SKILL_CATEGORY_LABEL } from '../constants/portal.constants';
import type { TalentBadge } from '../types/talent.types';

export interface TalentBadgeListProps {
  badges: readonly TalentBadge[];
  onViewProof: (skillId: string) => void;
}

/**
 * Huy hiệu kỹ năng ĐÃ XÁC THỰC của ứng viên (admin.md p6-08 §2.4 "SkillBadgeCard web"): tên, ngày cấp, số liệu minh chứng và nút "Xem minh chứng". Chỉ có khi ứng viên
 * bật hiển thị kỹ năng — vắng thì nói rõ thay vì để trống. Icon kỹ năng là tên trong bộ icon CỦA APP DI ĐỘNG nên admin không vẽ được; hiện tên và nhóm bằng chữ.
 */
const TalentBadgeList = memo(function TalentBadgeList({ badges, onViewProof }: TalentBadgeListProps) {
  if (badges.length === 0) {
    return (
      <Text size="small" skin="muted">
        Ứng viên chưa hiển thị huy hiệu kỹ năng nào.
      </Text>
    );
  }
  return (
    <ul aria-label="Huy hiệu kỹ năng" className="flex flex-col gap-2">
      {badges.map((b) => (
        <li
          key={b.skillId}
          className="flex flex-wrap items-center justify-between gap-2 border border-border-1 bg-bg-1 p-2"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="truncate text-body-14-semibold text-fg-1">{b.name}</span>
              <Badge color="neutral" size="sm" variant="outline">
                {SKILL_CATEGORY_LABEL[b.category] ?? b.category}
              </Badge>
            </div>
            <span className="tabular-nums text-caption-12 text-fg-3">
              Cấp {formatDate(b.unlockedAt, 'DD/MM/YYYY')} · {formatNumber(b.proof.tasksDone)} task ·{' '}
              {formatNumber(b.proof.storyPoints, 1)} điểm
              {b.proof.avgPeerScore !== null ? ` · review ${formatNumber(b.proof.avgPeerScore, 1)}` : ''}
            </span>
          </div>
          <Button size="xs" variant="stroke" onClick={() => onViewProof(b.skillId)}>
            Xem minh chứng
          </Button>
        </li>
      ))}
    </ul>
  );
});

export default TalentBadgeList;

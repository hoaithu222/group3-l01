import { memo } from 'react';

import { Callout, Drawer, EmptyState, Skeleton, Text } from '@/shared/ui';
import { formatDate, formatNumber } from '@/shared/utils/format';

import { useUserSkillProof } from '../service/skill.queries';
import { summarizeCriteria } from '../utils/skill-form.utils';

export interface UserSkillProofDrawerProps {
  userId: string;
  /** `null` = đóng. */
  skillId: string | null;
  onClose: () => void;
}

const score = (n: number | null) => (n === null ? '—' : formatNumber(n, 1));

/**
 * Ngăn kéo lồng "Minh chứng" (admin.md p6-06 §2.3) — số liệu + danh sách task CHỈ id rút gọn, điểm, ngày, review. KHÔNG có tiêu đề/nội dung task
 * (vận hành không đọc dữ liệu nhóm) — BE cũng không trả (`GET /admin/users/:id/skills/:skillId/proof`).
 */
const UserSkillProofDrawer = memo(function UserSkillProofDrawer({
  userId,
  skillId,
  onClose,
}: UserSkillProofDrawerProps) {
  const { data, isError } = useUserSkillProof(userId, skillId);

  let body;
  if (data) {
    body = (
      <div className="flex flex-col gap-3">
        <Text size="small" skin="muted">
          Cấp {formatDate(data.unlockedAt, 'DD/MM/YYYY')} theo tiêu chí lúc đó:{' '}
          {summarizeCriteria(data.criteriaSnapshot)}
        </Text>
        <dl className="grid grid-cols-3 gap-3">
          {[
            { label: 'Task', value: formatNumber(data.tasksDone) },
            { label: 'Story points', value: formatNumber(data.storyPoints, 1) },
            { label: 'Review TB', value: score(data.avgPeerScore) },
          ].map((s) => (
            <div key={s.label} className="flex flex-col gap-0.5">
              <dt className="text-body-13 text-fg-3">{s.label}</dt>
              <dd className="tabular-nums text-body-14-semibold text-fg-1">{s.value}</dd>
            </div>
          ))}
        </dl>
        {data.tasks.length === 0 ? (
          <EmptyState size="sm" title="Không còn task minh chứng" />
        ) : (
          <ul aria-label="Task minh chứng" className="flex flex-col gap-1.5">
            {data.tasks.map((t) => (
              <li
                key={`${t.taskRef}-${t.completedAt}`}
                className="flex flex-wrap items-center gap-3 text-body-14"
              >
                <span className="font-mono text-fg-2">{t.taskRef}</span>
                <span className="tabular-nums">{formatNumber(t.storyPoints, 1)} điểm</span>
                <span className="text-fg-3">{formatDate(t.completedAt, 'DD/MM/YYYY')}</span>
                <span className="tabular-nums text-fg-3">review {score(t.reviewScore)}</span>
                {!t.active ? (
                  <span className="text-caption-12 text-fg-4">(task đã mở lại)</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  } else if (isError) {
    body = (
      <Callout
        description="Huy hiệu không còn hoặc kết nối bị gián đoạn."
        intent="error"
        title="Không tải được minh chứng"
      />
    );
  } else {
    body = <Skeleton className="w-full" height={120} />;
  }

  return (
    <Drawer
      open={skillId !== null}
      side="right"
      size="md"
      title={data ? `Minh chứng · ${data.skill.name}` : 'Minh chứng'}
      onOpenChange={(o) => !o && onClose()}
    >
      {body}
    </Drawer>
  );
});

export default UserSkillProofDrawer;

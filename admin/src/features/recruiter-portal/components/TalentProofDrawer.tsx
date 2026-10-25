import { memo } from 'react';

import { Callout, Drawer, EmptyState, Skeleton, Text } from '@/shared/ui';
import { formatDate, formatNumber } from '@/shared/utils/format';

import { useTalentProof } from '../service/talent.queries';

export interface TalentProofDrawerProps {
  companyId: string | undefined;
  userId: string | null;
  /** `null` = đóng. */
  skillId: string | null;
  onClose: () => void;
}

const score = (n: number | null) => (n === null ? '—' : formatNumber(n, 1));

/**
 * Ngăn kéo lồng "Minh chứng" của một huy hiệu (admin.md p6-08 §2.4): số liệu + danh sách task ĐÃ LỌC THEO NGƯỜI XEM (HR). BE ẩn tiêu đề task và tên nhóm trừ khi ứng viên bật
 * `proofTitles` — nên `title`/`workspaceName` có thể là `null` và ngăn kéo nói rõ "ẩn theo cài đặt của ứng viên" thay vì để ô trống khó hiểu. Huy hiệu không còn hiển thị
 * (ứng viên vừa tắt Open to work/tắt hiện kỹ năng) → 404: nói rõ lý do, không "Thử lại". Chỉ tải khi HR bấm "Xem minh chứng" vì mỗi lượt tính vào trần xem hồ sơ/ngày.
 */
const TalentProofDrawer = memo(function TalentProofDrawer({
  companyId,
  userId,
  skillId,
  onClose,
}: TalentProofDrawerProps) {
  const { data, isError } = useTalentProof(companyId, userId, skillId);

  let body;
  if (data) {
    body = (
      <div className="flex flex-col gap-3">
        <Text size="small" skin="muted">
          Cấp {formatDate(data.unlockedAt, 'DD/MM/YYYY')} — số liệu do hệ thống ghi nhận, không phải ứng viên tự khai.
        </Text>
        <dl className="grid grid-cols-3 gap-3">
          {[
            { label: 'Task hoàn thành', value: formatNumber(data.tasksDone) },
            { label: 'Story points', value: formatNumber(data.storyPoints, 1) },
            { label: 'Review trung bình', value: score(data.avgPeerScore) },
          ].map((s) => (
            <div key={s.label} className="flex flex-col gap-0.5">
              <dt className="text-body-13 text-fg-3">{s.label}</dt>
              <dd className="tabular-nums text-body-14-semibold text-fg-1">{s.value}</dd>
            </div>
          ))}
        </dl>
        {data.tasks.length === 0 ? (
          <EmptyState size="sm" title="Không có task minh chứng để hiển thị" />
        ) : (
          <ul aria-label="Task minh chứng" className="flex flex-col gap-2">
            {data.tasks.map((t, i) => (
              <li key={`${t.completedAt}-${i}`} className="flex flex-col gap-0.5">
                <span className={t.title ? 'text-body-14 text-fg-1' : 'text-body-14 text-fg-4'}>
                  {t.title ?? 'Tiêu đề được ẩn theo cài đặt của ứng viên'}
                </span>
                <span className="tabular-nums text-caption-12 text-fg-3">
                  {formatNumber(t.storyPoints, 1)} điểm · hoàn thành {formatDate(t.completedAt, 'DD/MM/YYYY')} · review {score(t.reviewScore)}
                  {t.workspaceName ? ` · ${t.workspaceName}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  } else if (isError) {
    body = (
      <Callout
        description="Ứng viên có thể vừa tắt hiển thị kỹ năng hoặc Open to work."
        intent="error"
        title="Không xem được minh chứng"
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

export default TalentProofDrawer;

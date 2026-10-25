import { memo } from 'react';

import { Callout, Skeleton, Text } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import { useEligiblePreview } from '../service/skill.queries';
import type { SkillCriteria } from '../types/skill.types';

export interface EligiblePreviewPanelProps {
  /** Kỹ năng đã lưu; `undefined` = đang tạo mới (chưa có tiến độ để xem trước). */
  skillId: string | undefined;
  /** Tiêu chí đang nhập (đã debounce 800 ms); `undefined` = tiêu chí đang lưu. */
  criteria: SkillCriteria | undefined;
  /** Tiêu chí đang nhập KHÓ hơn bản đã lưu. */
  harder: boolean;
}

/**
 * Khối "Xem trước" (admin.md p6-06 §2.2, CR-27): `GET /admin/skills/:id/eligible-preview?criteria=` → "N người đủ điều kiện · M đã có huy hiệu · K sẽ
 * được cấp khi lưu và bật". Tiêu chí khó hơn → Callout huy hiệu đã cấp KHÔNG bị thu hồi.
 */
const EligiblePreviewPanel = memo(function EligiblePreviewPanel({
  skillId,
  criteria,
  harder,
}: EligiblePreviewPanelProps) {
  const { data, isFetching, isError } = useEligiblePreview(skillId, criteria);

  let body;
  if (!skillId) {
    body = (
      <Text size="small" skin="muted">
        Lưu kỹ năng trước (đang tắt) để xem số người đủ điều kiện — tiến độ được ghi cả khi kỹ năng
        chưa bật.
      </Text>
    );
  } else if (isError) {
    body = (
      <Text size="small" skin="error">
        Tiêu chí đang nhập chưa hợp lệ hoặc không tải được số liệu.
      </Text>
    );
  } else if (!data) {
    body = <Skeleton className="w-full" height={48} />;
  } else {
    body = (
      <dl aria-busy={isFetching} className="grid grid-cols-3 gap-3">
        {[
          { label: 'Đủ điều kiện', value: data.eligibleCount },
          { label: 'Đã có huy hiệu', value: data.alreadyHolding },
          { label: 'Sẽ được cấp', value: data.willGrant },
        ].map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5">
            <dt className="text-body-13 text-fg-3">{s.label}</dt>
            <dd className="tabular-nums text-body-14-semibold text-fg-1">
              {formatNumber(s.value)}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <section aria-label="Xem trước người đủ điều kiện" className="flex flex-col gap-2">
      <Text weight="bold">Xem trước</Text>
      {body}
      {harder ? (
        <Callout
          description="Huy hiệu đã cấp sẽ KHÔNG bị thu hồi; tiêu chí mới chỉ áp cho người đạt sau khi lưu."
          intent="warning"
          title="Tiêu chí khó hơn bản đã lưu"
        />
      ) : null}
    </section>
  );
});

export default EligiblePreviewPanel;

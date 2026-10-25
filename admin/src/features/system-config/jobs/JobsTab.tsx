import { memo, useCallback } from 'react';

import { Tabs } from '@/shared/ui';
import { useQueryParams } from '@/shared/hooks';

import FailedJobsTable from './components/FailedJobsTable';
import OutboxTable from './components/OutboxTable';
import QueueOverview from './components/QueueOverview';
import {
  DEFAULT_SUB_TAB,
  SUB_TAB_OPTIONS,
  SUB_TAB_PARAM,
  type JobsSubTab,
} from './constants/jobs.constants';

const isSubTab = (value: string): value is JobsSubTab =>
  SUB_TAB_OPTIONS.some((o) => o.key === value);

/**
 * Tab "Job nền" của trang `system-config` (admin.md p0-04) — 3 sub-tab
 * `queues | failed | outbox` đồng bộ URL (`?tab=jobs&sub=`).
 *
 * Bộ lọc/phân trang thuộc riêng từng sub-tab (`?queue=`, `?status=`, `?type=`,
 * `?page=`) — đổi sub-tab thì xoá hết, khỏi để `page=3` của "Job lỗi" rơi sang
 * "Outbox". Chỉ sub-tab đang chọn được mount ⇒ polling 15 s của "Hàng đợi" tự
 * dừng khi rời sub-tab đó.
 */
const JobsTab = memo(function JobsTab() {
  const qp = useQueryParams();
  const requested = qp.getParam(SUB_TAB_PARAM, DEFAULT_SUB_TAB);
  const sub = isSubTab(requested) ? requested : DEFAULT_SUB_TAB;

  const { updateParams } = qp;
  const handleChange = useCallback(
    (key: string) =>
      updateParams({
        [SUB_TAB_PARAM]: key === DEFAULT_SUB_TAB ? null : key,
        page: null,
        pageSize: null,
        queue: null,
        status: null,
        type: null,
      }),
    [updateParams],
  );

  return (
    <div className="flex flex-col gap-2">
      <Tabs
        aria-label="Loại dữ liệu job nền"
        indicator="bottom"
        options={SUB_TAB_OPTIONS}
        size="sm"
        value={sub}
        onValueChange={handleChange}
      />
      {sub === 'queues' && <QueueOverview />}
      {sub === 'failed' && <FailedJobsTable />}
      {sub === 'outbox' && <OutboxTable />}
    </div>
  );
});

export default JobsTab;

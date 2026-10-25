import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import { BoxPanel, Button, Callout, Dropdown, Table, Text, Toolbar } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { useQueryParams } from '@/shared/hooks';

import {
  FAILED_DEFAULT_PAGE_SIZE,
  FILTER_ALL,
  QUEUE_FILTER_OPTIONS,
} from '../constants/jobs.constants';
import { useFailedJobs } from '../service/jobs.queries';
import type { FailedJob, FailedJobAction, QueueName } from '../types/jobs.types';
import { QUEUE_NAMES } from '../types/jobs.types';
import FailedJobActionModal from './FailedJobActionModal';
import FailedJobDrawer from './FailedJobDrawer';
import { buildFailedJobColumns } from './failed-jobs.columns';

interface PendingAction {
  job: FailedJob;
  action: FailedJobAction;
}

/** `?queue=` lạ (gõ tay) ⇒ coi như không lọc, không gửi giá trị BE sẽ từ chối 400. */
const asQueue = (value: string): QueueName | undefined =>
  (QUEUE_NAMES as readonly string[]).includes(value) ? (value as QueueName) : undefined;

/**
 * Sub-tab "Job lỗi" (admin.md p0-04 §2.2) — bảng + lọc hàng đợi + phân trang
 * `start/limit`, đều đồng bộ URL (`?queue=&page=&pageSize=`).
 *
 * `start = (page − 1) × pageSize` — URL giữ `page` để dùng chung `Table`/
 * `useQueryParams`; chỉ lúc gọi API mới đổi sang `start/limit` của BE.
 */
const FailedJobsTable = memo(function FailedJobsTable() {
  const canUpdate = useAuthStore((s) => s.hasPermission)('system-config', 'update');
  const qp = useQueryParams({ defaultPageSize: FAILED_DEFAULT_PAGE_SIZE });
  const queueValue = qp.getParam('queue', FILTER_ALL);
  const queue = asQueue(queueValue);

  const [selected, setSelected] = useState<FailedJob | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const params = useMemo(
    () => ({ queue, start: (qp.page - 1) * qp.pageSize, limit: qp.pageSize }),
    [queue, qp.page, qp.pageSize],
  );
  const { data, isLoading, isFetching, isError, refetch } = useFailedJobs(params);
  const total = data?.total ?? 0;
  // Lỗi tải mà chưa có dữ liệu: KHÔNG được vẽ bảng rỗng — "Không có job lỗi nào" là câu trấn an SAI đúng
  // lúc API hỏng, và người vận hành sẽ tin nó.
  const loadFailed = isError && !data;

  // Trang hiện tại hết dòng (vd gỡ/chạy lại job cuối của trang cuối): lùi từng trang, không lùi
  // quá trang cuối còn dữ liệu, để không kẹt ở trang rỗng.
  const { page, pageSize, setPage } = qp;
  useEffect(() => {
    if (data && data.items.length === 0 && page > 1) {
      setPage(Math.max(1, Math.min(page - 1, Math.ceil(data.total / pageSize))));
    }
  }, [data, page, pageSize, setPage]);

  const columns = useMemo(
    () =>
      buildFailedJobColumns({
        canUpdate,
        onOpen: setSelected,
        onAction: (job, action) => setPending({ job, action }),
      }),
    [canUpdate],
  );
  const rowKey = useCallback((row: FailedJob) => `${row.queue}:${row.jobId}`, []);

  return (
    <div className="flex flex-col gap-2">
      <Toolbar
        left={
          <>
            <Dropdown
              aria-label="Lọc theo hàng đợi"
              className="w-44"
              options={QUEUE_FILTER_OPTIONS}
              size="sm"
              value={queue ?? FILTER_ALL}
              onValueChange={(v) => qp.setParam('queue', v === FILTER_ALL ? null : v)}
            />
            {!queue && total > pageSize && (
              <Text size="tiny" skin="muted">
                Đang gộp mọi hàng đợi — phân trang chỉ gần đúng, chọn một hàng đợi để duyệt đủ.
              </Text>
            )}
          </>
        }
        right={
          <Button
            loading={isFetching}
            size="sm"
            startIcon={<SystemIcon name="arrows-rotate-outline" size={14} />}
            variant="stroke"
            onClick={() => void refetch()}
          >
            Làm mới
          </Button>
        }
      />
      <BoxPanel border="hairline" className="h-auto" title="Job lỗi">
        {loadFailed ? (
          <div className="p-2">
            <Callout
              action={
                <Button size="sm" variant="stroke" onClick={() => void refetch()}>
                  Thử lại
                </Button>
              }
              description="Kiểm tra kết nối rồi thử lại."
              intent="error"
              title="Không tải được danh sách job lỗi"
            />
          </div>
        ) : (
          <Table
            columns={columns}
            currentPage={qp.page}
            data={data?.items ?? []}
            emptyMessage="Không có job lỗi nào"
            loading={isLoading}
            pageSize={qp.pageSize}
            rowKey={rowKey}
            total={total}
            onPageChange={qp.setPage}
            onPageSizeChange={qp.setPageSize}
          />
        )}
      </BoxPanel>

      <FailedJobDrawer
        canUpdate={canUpdate}
        job={selected}
        onAction={(job, action) => setPending({ job, action })}
        onClose={() => setSelected(null)}
      />
      {pending && (
        <FailedJobActionModal
          action={pending.action}
          job={pending.job}
          onClose={() => setPending(null)}
          onDone={() => setSelected(null)}
        />
      )}
    </div>
  );
});

export default FailedJobsTable;

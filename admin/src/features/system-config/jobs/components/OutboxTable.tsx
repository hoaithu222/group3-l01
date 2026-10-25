import { memo, useCallback, useMemo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import { BoxPanel, Button, Callout, Dropdown, Input, Table, Toolbar } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { useDebounce, useImeSafeSearchInput, useQueryParams } from '@/shared/hooks';
import { statusBadge } from '@/shared/utils/format';

import { FILTER_ALL, OUTBOX_DEFAULT_STATUS, OUTBOX_STATUSES } from '../constants/jobs.constants';
import { useOutbox } from '../service/jobs.queries';
import type { OutboxEvent, OutboxStatus } from '../types/jobs.types';
import OutboxRequeueModal from './OutboxRequeueModal';
import { buildOutboxColumns } from './outbox.columns';

const STATUS_OPTIONS = [
  { value: FILTER_ALL, label: 'Mọi trạng thái' },
  ...OUTBOX_STATUSES.map((s) => ({ value: s, label: statusBadge('outbox', s).label })),
];

const isOutboxStatus = (value: string): value is OutboxStatus =>
  (OUTBOX_STATUSES as readonly string[]).includes(value);

/**
 * Sub-tab "Outbox" (admin.md p0-04 §2.3) — bảng cursor ("Tải thêm"), lọc trạng
 * thái (mặc định `FAILED`) + loại, đồng bộ URL (`?status=&type=`).
 *
 * URL không có `status` ⇒ `FAILED`; "Mọi trạng thái" phải ghi rõ `status=all`
 * (nếu không thì bỏ lọc và quay về mặc định là một).
 */
const OutboxTable = memo(function OutboxTable() {
  const canUpdate = useAuthStore((s) => s.hasPermission)('system-config', 'update');
  const qp = useQueryParams();
  const statusValue = qp.getParam('status', OUTBOX_DEFAULT_STATUS);
  const status = isOutboxStatus(statusValue) ? statusValue : undefined;
  const typeValue = qp.getParam('type');
  const { inputProps } = useImeSafeSearchInput(typeValue, (v) =>
    qp.setParam('type', v.trim() || null),
  );
  const type = useDebounce(typeValue.trim(), 300);

  const params = useMemo(() => ({ status, type: type || undefined }), [status, type]);
  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    isError,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useOutbox(params);
  const rows = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  // Lỗi tải mà chưa có dòng nào: báo lỗi thay vì "Không có sự kiện outbox nào khớp bộ lọc" (nói dối).
  const loadFailed = isError && rows.length === 0;

  const [pending, setPending] = useState<OutboxEvent | null>(null);
  const columns = useMemo(
    () => buildOutboxColumns({ canUpdate, onRequeue: setPending }),
    [canUpdate],
  );
  const rowKey = useCallback((row: OutboxEvent) => row.id, []);

  return (
    <div className="flex flex-col gap-2">
      <Toolbar
        left={
          <>
            <Dropdown
              aria-label="Lọc theo trạng thái"
              className="w-44"
              options={STATUS_OPTIONS}
              size="sm"
              value={status ?? FILTER_ALL}
              onValueChange={(v) => qp.setParam('status', v === OUTBOX_DEFAULT_STATUS ? null : v)}
            />
            <Input
              {...inputProps}
              clearable
              placeholder="Lọc theo loại (vd call.ring-timeout)"
              size="sm"
              wrapperClassName="w-72"
            />
          </>
        }
        right={
          <Button
            loading={isFetching && !isFetchingNextPage}
            size="sm"
            startIcon={<SystemIcon name="arrows-rotate-outline" size={14} />}
            variant="stroke"
            onClick={() => void refetch()}
          >
            Làm mới
          </Button>
        }
      />
      <BoxPanel
        border="hairline"
        className="h-auto"
        footer={
          hasNextPage ? (
            <Button
              loading={isFetchingNextPage}
              size="sm"
              variant="stroke"
              onClick={() => void fetchNextPage()}
            >
              Tải thêm
            </Button>
          ) : undefined
        }
        title="Sự kiện outbox"
      >
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
              title="Không tải được sự kiện outbox"
            />
          </div>
        ) : (
          <Table
            columns={columns}
            data={rows}
            emptyMessage="Không có sự kiện outbox nào khớp bộ lọc"
            loading={isLoading}
            pagination={false}
            rowKey={rowKey}
          />
        )}
      </BoxPanel>

      {pending && <OutboxRequeueModal event={pending} onClose={() => setPending(null)} />}
    </div>
  );
});

export default OutboxTable;

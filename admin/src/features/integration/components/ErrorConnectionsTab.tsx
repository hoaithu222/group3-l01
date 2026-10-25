import { memo, useCallback, useMemo, useState } from 'react';

import { useQueryParams } from '@/shared/hooks';
import { Badge, Button, Callout, Drawer, Dropdown, Table, Toolbar } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate } from '@/shared/utils/format';
import { AuditTrailPanel } from '@/shared/widgets/audit-trail';

import {
  CONNECTION_STATUS_FILTER_OPTIONS,
  CONNECTION_STATUS_META,
  CONNECTIONS_PAGE_SIZE,
  INTEGRATION_PROVIDER_LABELS,
  statusReasonLabel,
} from '../constants/integration.labels';
import { useErrorConnections } from '../service/integration.queries';
import type { AdminConnection } from '../types/integration.types';

const DEFAULT_STATUS = 'ERROR,REVOKED';
const when = (iso: string | null) => (iso ? formatDate(iso, 'HH:mm DD/MM/YYYY') : '—');

function buildColumns(onOpen: (c: AdminConnection) => void): TableColumn<AdminConnection>[] {
  return [
    {
      key: 'workspace',
      header: 'Workspace',
      width: 180,
      cell: (c) => <span className="block truncate">{c.workspace?.name ?? '—'}</span>,
    },
    {
      key: 'provider',
      header: 'Nhà cung cấp',
      width: 130,
      cell: (c) => INTEGRATION_PROVIDER_LABELS[c.provider] ?? c.provider,
    },
    {
      key: 'externalName',
      header: 'Tài khoản ngoài',
      width: 170,
      cell: (c) => (
        <Button className="justify-start" size="sm" variant="ghost" onClick={() => onOpen(c)}>
          {c.externalName}
        </Button>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 130,
      cell: (c) => (
        <Badge color={CONNECTION_STATUS_META[c.status]?.color ?? 'neutral'} variant="tinted">
          {CONNECTION_STATUS_META[c.status]?.label ?? c.status}
        </Badge>
      ),
    },
    { key: 'reason', header: 'Lý do', width: 260, cell: (c) => statusReasonLabel(c.statusReason) },
    {
      key: 'createdBy',
      header: 'Người kết nối',
      width: 160,
      cell: (c) => c.createdBy.name ?? c.createdBy.id,
    },
    { key: 'lastEventAt', header: 'Sự kiện cuối', width: 150, cell: (c) => when(c.lastEventAt) },
  ];
}

/**
 * Tab "Kết nối lỗi" (admin.md p5-03 §2.3): kết nối ERROR/REVOKED — CHỈ ĐỌC (vận hành liên hệ chủ nhóm, không sửa cấu hình thay họ). Lý do hiện
 * bằng chữ tiếng Việt; ngăn kéo có nhật ký (`AuditTrailPanel targetType="Integration"`).
 */
const ErrorConnectionsTab = memo(function ErrorConnectionsTab() {
  const qp = useQueryParams();
  const raw = qp.getParam('status');
  const status = CONNECTION_STATUS_FILTER_OPTIONS.some((o) => o.value === raw)
    ? raw
    : DEFAULT_STATUS;
  const params = useMemo(
    () => ({ page: qp.page, limit: CONNECTIONS_PAGE_SIZE, status }),
    [qp.page, status],
  );
  const { data, isLoading, isError, refetch } = useErrorConnections(params);
  const [open, setOpen] = useState<AdminConnection | null>(null);
  const columns = useMemo(() => buildColumns(setOpen), []);
  const rowKey = useCallback((c: AdminConnection) => c.id, []);

  return (
    <div className="flex flex-col gap-3">
      <Toolbar
        left={
          <Dropdown
            aria-label="Lọc theo trạng thái kết nối"
            className="w-48"
            options={CONNECTION_STATUS_FILTER_OPTIONS}
            size="sm"
            value={status}
            onValueChange={(v) =>
              qp.updateParams({ status: v === DEFAULT_STATUS ? null : v, page: null })
            }
          />
        }
      />
      {isError && (
        <Callout
          action={
            <Button size="sm" variant="stroke" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
          intent="error"
          title="Không tải được danh sách kết nối"
        />
      )}
      {(!isError || data) && (
        <Table
          columns={columns}
          currentPage={qp.page}
          data={data?.data ?? []}
          emptyMessage="Không có kết nối nào đang lỗi"
          loading={isLoading}
          pageSize={CONNECTIONS_PAGE_SIZE}
          rowKey={rowKey}
          total={data?.meta?.total ?? 0}
          onPageChange={qp.setPage}
        />
      )}
      <Drawer
        open={!!open}
        side="right"
        size="md"
        title={
          open ? `${INTEGRATION_PROVIDER_LABELS[open.provider]} · ${open.externalName}` : 'Kết nối'
        }
        onOpenChange={(next) => !next && setOpen(null)}
      >
        {open ? <AuditTrailPanel targetId={open.id} targetType="Integration" /> : null}
      </Drawer>
    </div>
  );
});

export default ErrorConnectionsTab;

import { memo, useCallback, useMemo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import {
  Badge,
  Button,
  Callout,
  ConfirmWithReasonModal,
  Table,
  Toggle,
  Tooltip,
} from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate, formatNumber } from '@/shared/utils/format';

import {
  useIntegrationProviders,
  useToggleIntegrationProvider,
} from '../service/integration.queries';
import type { AdminProviderRow } from '../types/integration.types';

function buildColumns(
  canUpdate: boolean,
  onToggle: (row: AdminProviderRow) => void,
): TableColumn<AdminProviderRow>[] {
  return [
    {
      key: 'label',
      header: 'Nhà cung cấp',
      width: 170,
      cell: (p) => <span className="text-body-14-semibold">{p.label}</span>,
    },
    {
      key: 'configured',
      header: 'Đã cấu hình khoá',
      width: 150,
      cell: (p) => (
        <Badge color={p.configured ? 'success' : 'neutral'} variant="tinted">
          {p.configured ? 'Đủ khoá' : 'Thiếu khoá'}
        </Badge>
      ),
    },
    {
      key: 'enabled',
      header: 'Bật',
      width: 90,
      cell: (p) => (
        <Toggle
          aria-label={`Bật ${p.label}`}
          checked={p.enabled}
          disabled={!canUpdate || !p.configured}
          onCheckedChange={() => onToggle(p)}
        />
      ),
    },
    {
      key: 'connections',
      header: 'Kết nối (hoạt động / lỗi / thu hồi)',
      width: 230,
      cell: (p) => (
        <span className="tabular-nums">
          {formatNumber(p.connections.active)} / {formatNumber(p.connections.error)} /{' '}
          {formatNumber(p.connections.revoked)}
        </span>
      ),
    },
    {
      key: 'events24h',
      header: 'Sự kiện 24 giờ',
      width: 120,
      align: 'right',
      cell: (p) => <span className="tabular-nums">{formatNumber(p.events24h)}</span>,
    },
    {
      key: 'lastError',
      header: 'Lỗi gần nhất',
      width: 260,
      cell: (p) =>
        p.lastError ? (
          <Tooltip content={p.lastError.message}>
            <span className="block truncate">
              {formatDate(p.lastError.at, 'HH:mm DD/MM')} · {p.lastError.message}
            </span>
          </Tooltip>
        ) : (
          <span className="text-fg-4">—</span>
        ),
    },
  ];
}

/**
 * Tab "Nhà cung cấp" (admin.md p5-03 §2.2): 4 dòng; "Đã cấu hình khoá" CHỈ ĐỌC (env của server, không hiện giá trị); công tắc Bật khoá khi thiếu
 * khoá hoặc thiếu `integration:update`. Đổi → `ConfirmWithReasonModal` → `PUT /admin/integrations/providers/:provider { enabled, reason }`.
 */
const ProvidersTab = memo(function ProvidersTab() {
  const canUpdate = useAuthStore((s) => s.hasPermission('integration', 'update'));
  const { data, isLoading, isError, refetch } = useIntegrationProviders();
  const toggle = useToggleIntegrationProvider();
  const [pending, setPending] = useState<AdminProviderRow | null>(null);

  const columns = useMemo(() => buildColumns(canUpdate, setPending), [canUpdate]);
  const rowKey = useCallback((p: AdminProviderRow) => p.provider, []);

  const confirm = useCallback(
    async (reason: string) => {
      if (!pending) return;
      await toggle.mutateAsync({ provider: pending.provider, enabled: !pending.enabled, reason });
      setPending(null);
    },
    [pending, toggle],
  );

  return (
    <div className="flex flex-col gap-3">
      {isError && (
        <Callout
          action={
            <Button size="sm" variant="stroke" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
          intent="error"
          title="Không tải được danh sách nhà cung cấp"
        />
      )}
      {(!isError || data) && (
        <Table
          columns={columns}
          data={data ?? []}
          emptyMessage="Chưa có nhà cung cấp"
          loading={isLoading}
          rowKey={rowKey}
        />
      )}
      <ConfirmWithReasonModal
        confirmTone={pending?.enabled ? 'danger' : 'primary'}
        impact={
          pending
            ? pending.enabled
              ? `Tắt ${pending.label}: webhook mới của nhà cung cấp sẽ bị bỏ qua và nút kết nối bị ẩn; kết nối hiện có giữ nguyên.`
              : `Bật lại ${pending.label}: các nhóm kết nối và nhận thông báo được ngay.`
            : null
        }
        open={!!pending}
        title={pending?.enabled ? 'Tắt nhà cung cấp' : 'Bật nhà cung cấp'}
        onConfirm={confirm}
        onOpenChange={(open) => !open && setPending(null)}
      />
    </div>
  );
});

export default ProvidersTab;

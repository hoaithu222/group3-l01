import { Badge, Text } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { formatDate } from '@/shared/utils/format';
import {
  CONNECTION_STATUS_META,
  INTEGRATION_PROVIDER_LABELS,
  statusReasonLabel,
} from '@/features/integration';
import type { AdminWorkspaceConnection, IntegrationTarget } from '@/features/integration';

const when = (iso: string | null) => (iso ? formatDate(iso, 'HH:mm DD/MM/YYYY') : '—');

/**
 * Kênh nhận của kết nối (admin.md p5-03 §2.4): kênh CÔNG KHAI hiện tên; kênh riêng tư và nhóm chat chỉ hiện "kênh riêng tư" — BE không trả tên
 * (admin không thấy tên nơi riêng tư). Kênh đã bị xoá/không còn → "Kênh không còn".
 */
export function targetLabel(target: IntegrationTarget): string {
  if (target.private) return 'Kênh riêng tư';
  return target.name ? `#${target.name}` : 'Kênh không còn';
}

/**
 * Cột bảng kết nối của một workspace (admin.md p5-03 §2.4) — CHỈ ĐỌC: nhà cung cấp · tài khoản ngoài · trạng thái (+ lý do bằng chữ) · kênh nhận
 * · người kết nối · sự kiện cuối. Không token, không cấu hình, không nút sửa thay chủ nhóm.
 */
export function buildWorkspaceIntegrationColumns(): TableColumn<AdminWorkspaceConnection>[] {
  return [
    {
      key: 'provider',
      header: 'Nhà cung cấp',
      width: 140,
      cell: (c) => INTEGRATION_PROVIDER_LABELS[c.provider] ?? c.provider,
    },
    {
      key: 'externalName',
      header: 'Tài khoản ngoài',
      width: 200,
      cell: (c) => <span className="block truncate text-fg-1">{c.externalName}</span>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 240,
      cell: (c) => {
        const meta = CONNECTION_STATUS_META[c.status];
        return (
          <div className="flex min-w-0 flex-col items-start gap-1">
            <Badge color={meta?.color ?? 'neutral'} variant="tinted">
              {meta?.label ?? c.status}
            </Badge>
            {c.statusReason ? (
              <Text size="small" skin="muted">
                {statusReasonLabel(c.statusReason)}
              </Text>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'target',
      header: 'Kênh nhận',
      width: 180,
      cell: (c) => (
        <span className="flex min-w-0 items-center gap-1.5">
          {c.target.private ? (
            <SystemIcon className="shrink-0 text-fg-3" name="lock-outline" size={14} />
          ) : null}
          <span className="truncate">{targetLabel(c.target)}</span>
        </span>
      ),
    },
    {
      key: 'createdBy',
      header: 'Người kết nối',
      width: 160,
      cell: (c) => c.createdBy.name ?? c.createdBy.id,
    },
    {
      key: 'lastEventAt',
      header: 'Sự kiện cuối',
      width: 150,
      cell: (c) => when(c.lastEventAt),
    },
  ];
}

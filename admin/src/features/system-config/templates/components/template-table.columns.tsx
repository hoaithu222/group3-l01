import { Badge, Button, TableDragHandle, Text } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { formatDate } from '@/shared/utils/format/format.utils';

import type { WorkspaceTemplate } from '../types/templates.types';

export interface TemplateColumnsOptions {
  /** Có `system-config:update` — quyết định cột tay cầm kéo và nhãn nút "Sửa"/"Xem". */
  canEdit: boolean;
  onOpen: (code: string) => void;
}

/**
 * Cột bảng mẫu nhóm (admin.md p5-04 §2.1): tay cầm kéo (chỉ khi được sửa), mã (mono, chỉ đọc), tên, số kênh, trạng thái, cập nhật
 * lúc/bởi, nút mở ngăn kéo. `updatedBy` BE chỉ trả id người sửa (null = bản seed) nên hiện id rút gọn, kèm id đầy đủ ở `title`.
 */
export function buildTemplateColumns({
  canEdit,
  onOpen,
}: TemplateColumnsOptions): TableColumn<WorkspaceTemplate>[] {
  const columns: TableColumn<WorkspaceTemplate>[] = [
    {
      key: 'code',
      header: 'Mã',
      width: 130,
      cell: (row) => <span className="font-mono text-caption-12 text-fg-2">{row.code}</span>,
    },
    {
      key: 'name',
      header: 'Tên mẫu',
      cell: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-body-14-medium text-fg-1">{row.name}</span>
          {row.description && (
            <Text className="truncate" size="tiny" skin="muted">
              {row.description}
            </Text>
          )}
        </div>
      ),
    },
    {
      key: 'channels',
      header: 'Số kênh',
      width: 90,
      align: 'right',
      cell: (row) => <span className="tabular-nums">{row.channels.length}</span>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 120,
      // Trạng thái bằng CHỮ (không chỉ màu): "Đang bật" / "Đã tắt".
      cell: (row) => (
        <Badge color={row.isActive ? 'success' : 'neutral'} size="sm" variant="tinted">
          {row.isActive ? 'Đang bật' : 'Đã tắt'}
        </Badge>
      ),
    },
    {
      key: 'updated',
      header: 'Cập nhật',
      width: 170,
      cell: (row) => (
        <div className="flex flex-col">
          <span className="tabular-nums text-caption-12 text-fg-2">
            {formatDate(row.updatedAt, 'HH:mm DD/MM/YYYY')}
          </span>
          {row.updatedBy ? (
            <span className="font-mono text-caption-12 text-fg-4" title={row.updatedBy}>
              {`bởi …${row.updatedBy.slice(-6)}`}
            </span>
          ) : (
            <span className="text-caption-12 text-fg-4">Bản seed</span>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 96,
      align: 'right',
      cell: (row) => (
        <Button
          aria-label={`${canEdit ? 'Sửa' : 'Xem'} mẫu ${row.name}`}
          size="sm"
          startIcon={<SystemIcon name={canEdit ? 'pen-outline' : 'eye-outline'} size={14} />}
          variant="ghost"
          onClick={() => onOpen(row.code)}
        >
          {canEdit ? 'Sửa' : 'Xem'}
        </Button>
      ),
    },
  ];

  return canEdit
    ? [{ key: 'drag', header: '', width: 40, cell: () => <TableDragHandle /> }, ...columns]
    : columns;
}

import { Text, Toggle, Tooltip } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';

import { lockReason, type FeatureRow, type PendingToggle } from '../utils/feature-rows';
import FeatureStatusBadge from './FeatureStatusBadge';

export interface FeatureColumnsOptions {
  /** Có `system-config:update` — thiếu thì mọi toggle bị khoá kèm lý do. */
  canEdit: boolean;
  /** Bấm toggle: mở hộp thoại lý do cho `{ row, next }`. */
  onToggle: (pending: PendingToggle) => void;
  /** Tiêu đề cột đầu — "Phân hệ" (mặc định) hoặc "Tiện ích" cho bảng cờ phụ. */
  labelHeader?: string;
}

/** Nguồn giá trị: phân hệ mặc định theo env; cờ phụ của tiện ích (p5-04) mặc định BẬT, không có env. */
const sourceLabel = (row: FeatureRow): string => {
  if (row.overridden) return 'Ghi đè runtime';
  return row.parentId ? 'Mặc định (bật)' : 'Mặc định env';
};

/** Cột bảng "Tính năng" — dùng chung cho bảng phân hệ và bảng cờ phụ của tiện ích. */
export function buildFeatureColumns({
  canEdit,
  onToggle,
  labelHeader = 'Phân hệ',
}: FeatureColumnsOptions): TableColumn<FeatureRow>[] {
  return [
    {
      key: 'label',
      header: labelHeader,
      cell: (row) => (
        <div className="flex flex-col">
          <span className="text-body-14-medium text-fg-1">{row.label}</span>
          <Text size="tiny" skin="muted">
            {row.id}
          </Text>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái mã',
      width: 150,
      cell: (row) => <FeatureStatusBadge row={row} />,
    },
    { key: 'source', header: 'Nguồn', width: 150, cell: sourceLabel },
    {
      key: 'toggle',
      header: 'Bật',
      width: 90,
      cell: (row) => {
        const reason = lockReason(row, canEdit);
        const toggle = (
          <Toggle
            aria-label={`Bật/tắt ${row.label}`}
            checked={row.enabled}
            disabled={reason !== null}
            onCheckedChange={(next) => onToggle({ row, next })}
          />
        );
        return reason ? (
          <Tooltip content={reason}>
            <span className="inline-flex">{toggle}</span>
          </Tooltip>
        ) : (
          toggle
        );
      },
    },
  ];
}

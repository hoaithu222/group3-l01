import { memo, useMemo } from 'react';

import { Table, Text } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';

import type { ConfigFieldMeta } from '../types/system-config.types';
import { formatFieldValue, readPath } from '../utils/config-fields';

export interface ConfigDiffPreviewProps {
  fields: ConfigFieldMeta[];
  /** Giá trị hiệu lực hiện tại (đơn vị lưu — byte cho `bytes`). */
  before: Record<string, unknown>;
  /** Giá trị sẽ áp dụng (đơn vị lưu). */
  after: Record<string, unknown>;
}

interface DiffRow {
  path: string;
  label: string;
  before: string;
  after: string;
}

/**
 * Bảng before/after CHỈ các ô đổi — nằm trong `impact` của `ConfirmWithReasonModal`
 * để người sửa thấy đúng những gì sắp áp dụng cho MỌI người dùng.
 */
const ConfigDiffPreview = memo(function ConfigDiffPreview({
  fields,
  before,
  after,
}: ConfigDiffPreviewProps) {
  const rows = useMemo<DiffRow[]>(
    () =>
      fields
        .filter((f) => readPath(before, f.path) !== readPath(after, f.path))
        .map((f) => ({
          path: f.path,
          label: f.label,
          before: formatFieldValue(f, readPath(before, f.path)),
          after: formatFieldValue(f, readPath(after, f.path)),
        })),
    [fields, before, after],
  );

  const columns = useMemo<TableColumn<DiffRow>[]>(
    () => [
      { key: 'label', header: 'Cấu hình' },
      { key: 'before', header: 'Trước', width: 120 },
      {
        key: 'after',
        header: 'Sau',
        width: 120,
        cell: (row) => <span className="text-body-14-medium text-fg-1">{row.after}</span>,
      },
    ],
    [],
  );

  if (rows.length === 0) {
    return (
      <Text size="tiny" skin="muted">
        Không có ô nào khác giá trị hiện hành.
      </Text>
    );
  }

  return <Table columns={columns} data={rows} pagination={false} rowKey={(row) => row.path} />;
});

export default ConfigDiffPreview;

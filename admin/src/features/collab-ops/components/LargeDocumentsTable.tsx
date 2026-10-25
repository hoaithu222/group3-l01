import { memo } from 'react';

import { Badge, BoxPanel, Callout, Table } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { formatDate, formatFileSize, formatNumber } from '@/shared/utils/format';

import { DOCUMENT_STATUS_META, LARGE_DOCUMENTS_LIMIT } from '../constants/collab-ops.constants';
import type { LargeDocumentRow } from '../types/collab-ops.types';
import { largeDocumentTitle } from '../utils/collab-ops.utils';

const dash = <span className="text-fg-5">—</span>;

const COLUMNS: TableColumn<LargeDocumentRow>[] = [
  {
    key: 'title',
    header: 'Tài liệu',
    width: 260,
    cell: (row) =>
      row.visibility === 'PRIVATE' ? (
        <span className="flex items-center gap-1 text-fg-3">
          <SystemIcon name="lock-bold" size={14} />
          {largeDocumentTitle(row)}
        </span>
      ) : (
        <span className="block truncate text-fg-1" title={largeDocumentTitle(row)}>
          {largeDocumentTitle(row)}
        </span>
      ),
  },
  {
    key: 'workspace',
    header: 'Workspace',
    width: 200,
    cell: (row) =>
      row.workspaceName ? <span className="block truncate text-fg-2">{row.workspaceName}</span> : dash,
  },
  {
    key: 'status',
    header: 'Trạng thái',
    width: 120,
    cell: (row) => {
      const meta = DOCUMENT_STATUS_META[row.status];
      return (
        <Badge color={meta?.color ?? 'neutral'} size="sm" variant="tinted">
          {meta?.label ?? row.status}
        </Badge>
      );
    },
  },
  {
    key: 'stateBytes',
    header: 'Dung lượng',
    align: 'right',
    width: 120,
    cell: (row) => <span className="tabular-nums text-fg-1">{formatFileSize(row.stateBytes)}</span>,
  },
  {
    key: 'snapshotCount',
    header: 'Số bản lưu',
    align: 'right',
    width: 110,
    cell: (row) => <span className="tabular-nums text-fg-2">{formatNumber(row.snapshotCount)}</span>,
  },
  {
    key: 'lastEditedAt',
    header: 'Sửa lần cuối',
    width: 150,
    cell: (row) =>
      row.lastEditedAt ? (
        <span className="text-fg-2">{formatDate(row.lastEditedAt, 'HH:mm DD/MM/YYYY')}</span>
      ) : (
        dash
      ),
  },
];

const rowKey = (row: LargeDocumentRow) => row.id;

export interface LargeDocumentsTableProps {
  rows: readonly LargeDocumentRow[] | undefined;
  loading: boolean;
  isError: boolean;
}

/**
 * Bảng top tài liệu theo dung lượng state (admin.md p6-01 §2.1) — CHỈ metadata, KHÔNG có nội dung. Tài liệu PRIVATE hiện "Tài liệu riêng tư"
 * (không bao giờ hiện tiêu đề, kể cả khi BE lỡ trả kèm) — admin không đọc tiêu đề/nội dung tài liệu riêng tư.
 * Tải lỗi mà chưa có dữ liệu → Callout, KHÔNG vẽ bảng "Chưa có tài liệu nào" (nói dối khi BE đang lỗi).
 */
const LargeDocumentsTable = memo(function LargeDocumentsTable({
  rows,
  loading,
  isError,
}: LargeDocumentsTableProps) {
  if (isError && !rows) {
    return <Callout intent="error" title="Không tải được danh sách tài liệu lớn" />;
  }

  return (
    <BoxPanel border="hairline" className="h-auto" title={`Top ${LARGE_DOCUMENTS_LIMIT} tài liệu lớn nhất`}>
      <Table
        columns={COLUMNS}
        data={[...(rows ?? [])]}
        emptyMessage="Chưa có tài liệu nào"
        loading={loading}
        rowKey={rowKey}
      />
    </BoxPanel>
  );
});

export default LargeDocumentsTable;

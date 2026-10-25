import type { UniqueIdentifier } from '@dnd-kit/core';
import { memo, useCallback, useMemo } from 'react';

import { Table } from '@/shared/ui';

import type { WorkspaceTemplate } from '../types/templates.types';
import { buildTemplateColumns } from './template-table.columns';

export interface TemplateTableProps {
  /** Đã sắp theo thứ tự hiển thị (bản kéo dở nếu có). */
  templates: WorkspaceTemplate[];
  /** Có `system-config:update` — bật kéo-thả sắp xếp và nút "Sửa". */
  canEdit: boolean;
  onOpen: (code: string) => void;
  /** Kéo-thả xong: khoá dòng đang kéo + khoá dòng đích (= mã mẫu). */
  onReorder: (activeKey: UniqueIdentifier, overKey: UniqueIdentifier) => void;
}

const rowKey = (row: WorkspaceTemplate) => row.code;

/**
 * Bảng mẫu nhóm — không phân trang (chỉ vài mẫu seed). Có `system-config:update` thì mỗi dòng có tay cầm kéo (dnd-kit của
 * `Table sortable`, dùng được bằng bàn phím: Space nhấc, phím mũi tên di chuyển, Space thả); bấm dòng hoặc nút mở ngăn kéo.
 */
const TemplateTable = memo(function TemplateTable({
  templates,
  canEdit,
  onOpen,
  onReorder,
}: TemplateTableProps) {
  const columns = useMemo(() => buildTemplateColumns({ canEdit, onOpen }), [canEdit, onOpen]);
  const handleRowClick = useCallback((row: WorkspaceTemplate) => onOpen(row.code), [onOpen]);

  return (
    <Table
      columns={columns}
      data={templates}
      emptyMessage="Chưa có mẫu nhóm nào"
      pagination={false}
      resizable={false}
      rowKey={rowKey}
      sortable={canEdit}
      onReorder={onReorder}
      onRowClick={handleRowClick}
    />
  );
});

export default TemplateTable;

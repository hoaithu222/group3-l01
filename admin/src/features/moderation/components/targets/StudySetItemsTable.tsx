import { memo } from 'react';

import { useQueryParams } from '@/shared/hooks';
import { Badge, BoxPanel, Callout, Table } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';

import {
  STUDY_ITEM_TYPE_LABEL,
  STUDY_ITEMS_PAGE_PARAM,
  STUDY_ITEMS_PAGE_SIZE,
} from '../../constants/study-set-moderation.constants';
import { useAdminStudyItems } from '../../service/study-set-moderation.queries';
import type { AdminStudyItem } from '../../types/study-set-moderation.types';
import { clipStudyText, studyItemAnswer } from '../../utils/study-items';
import StudyItemMediaCell from './StudyItemMediaCell';

const dash = <span className="text-fg-5">—</span>;

const COLUMNS: TableColumn<AdminStudyItem>[] = [
  {
    key: 'order',
    header: '#',
    align: 'right',
    width: 56,
    cell: (row) => <span className="tabular-nums text-fg-3">{row.order + 1}</span>,
  },
  {
    key: 'type',
    header: 'Loại',
    width: 150,
    cell: (row) => (
      <Badge color="neutral" size="sm" variant="tinted">
        {STUDY_ITEM_TYPE_LABEL[row.type] ?? row.type}
      </Badge>
    ),
  },
  {
    key: 'prompt',
    header: 'Câu hỏi / mặt trước',
    cell: (row) => (
      <span className="whitespace-pre-wrap text-fg-1">{clipStudyText(row.prompt)}</span>
    ),
  },
  {
    key: 'answer',
    header: 'Đáp án',
    cell: (row) => {
      const answer = studyItemAnswer(row);
      return answer ? <span className="whitespace-pre-wrap text-fg-2">{answer}</span> : dash;
    },
  },
  {
    key: 'media',
    header: 'Đính kèm',
    width: 240,
    cell: (row) => <StudyItemMediaCell item={row} />,
  },
];

const rowKey = (row: AdminStudyItem) => row.id;

export interface StudySetItemsTableProps {
  setId: string;
}

/**
 * Bảng NỘI DUNG mục của bộ học CÔNG KHAI (admin.md p4-01 §2.1) — phân trang 50/trang, trang nằm trên URL
 * (`?itemsPage=`). Chỉ được mount khi BE báo `canViewContent` (bộ PUBLIC): bộ WORKSPACE không có route
 * này (403), nên nơi gọi KHÔNG render component này cho chúng — nội dung nhóm không lộ ra admin.
 *
 * Cột "Đính kèm" hiện THUMBNAIL ảnh (URL ký ≤ 60 s do BE cấp — cache trang mục ngắn, xem `useAdminStudyItems`); âm thanh chỉ có nhãn "Có âm thanh".
 */
const StudySetItemsTable = memo(function StudySetItemsTable({ setId }: StudySetItemsTableProps) {
  const qp = useQueryParams({
    pageKey: STUDY_ITEMS_PAGE_PARAM,
    defaultPageSize: STUDY_ITEMS_PAGE_SIZE,
  });
  const { data, isLoading, isError } = useAdminStudyItems(setId, qp.page, true);

  if (isError) {
    return <Callout intent="error" title="Không tải được nội dung bộ học" />;
  }

  return (
    <BoxPanel border="hairline" className="h-auto" title="Nội dung bộ học (công khai)">
      <Table
        columns={COLUMNS}
        currentPage={qp.page}
        data={data?.data ?? []}
        emptyMessage="Bộ học chưa có mục nào"
        loading={isLoading}
        pageSize={STUDY_ITEMS_PAGE_SIZE}
        pageSizeOptions={[STUDY_ITEMS_PAGE_SIZE]}
        pagination
        rowKey={rowKey}
        total={data?.meta?.total ?? 0}
        onPageChange={qp.setPage}
      />
    </BoxPanel>
  );
});

export default StudySetItemsTable;

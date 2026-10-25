import { memo, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';

import { Table } from '@/shared/ui';

import type { AdminCompanyItem } from '../types/recruiter.types';
import { buildCompanyColumns } from './company-table.columns';

const TABLE_MIN_WIDTH = 1160;
const PAGE_SIZE_OPTIONS = [20, 50, 100];

export interface CompanyTableProps {
  rows: readonly AdminCompanyItem[];
  loading?: boolean;
  currentPage: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onRowClick: (company: AdminCompanyItem) => void;
  detailHref: (companyId: string) => string;
  emptyMessage: ReactNode;
}

/** Bảng doanh nghiệp — phân trang phía server, bấm dòng mở ngăn kéo chi tiết (`?companyId=`). */
const CompanyTable = memo(function CompanyTable({
  rows,
  loading,
  currentPage,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  onRowClick,
  detailHref,
  emptyMessage,
}: CompanyTableProps) {
  const columns = useMemo(() => buildCompanyColumns({ detailHref }), [detailHref]);
  const rowKey = useCallback((c: AdminCompanyItem) => c.id, []);
  const data = useMemo(() => [...rows], [rows]);

  return (
    <Table
      className="min-h-0 flex-1"
      columns={columns}
      currentPage={currentPage}
      data={data}
      emptyMessage={emptyMessage}
      fill
      loading={loading}
      minWidth={TABLE_MIN_WIDTH}
      pageSize={pageSize}
      pageSizeOptions={PAGE_SIZE_OPTIONS}
      rowKey={rowKey}
      total={total}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      onRowClick={onRowClick}
    />
  );
});

export default CompanyTable;

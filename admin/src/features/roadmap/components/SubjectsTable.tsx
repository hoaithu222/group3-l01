import { memo, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import { Button, Callout, Dropdown, Input, Table } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { useDebounce, useImeSafeSearchInput, useQueryParams } from '@/shared/hooks';

import { useAdminSubjects } from '../service/roadmap.queries';
import type { AdminSubjectRow, AdminSubjectsParams } from '../types/roadmap.types';
import { buildSubjectColumns } from './subjects.columns';

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Mọi trạng thái' },
  { value: 'DRAFT', label: 'Nháp' },
  { value: 'PUBLISHED', label: 'Đã xuất bản' },
  { value: 'ARCHIVED', label: 'Lưu trữ' },
];

/**
 * Danh sách lộ trình (admin.md §2 `SubjectsPage`) — tìm tên + lọc trạng thái, đồng bộ URL. `GET
 * /admin/roadmap/subjects` KHÔNG phân trang (be.md §4 chỉ nhận `?status&q`, giới hạn `subjectsMax: 50`
 * ở §9) nên bảng tắt `pagination`, không phải quên wiring. "Tạo lộ trình" là `<Link>` thật tới trang
 * riêng `subjects/new` (`roadmap:create`); "Sửa thông tin" nằm ở `SubjectDetailPage`.
 *
 * be.md không có endpoint đổi `RoadmapSubject.order` (chỉ `PUT .../order` cho phase/lesson TRONG một
 * môn) nên bảng KHÔNG kéo-thả sắp xếp môn dù admin.md §2 có nhắc — xem báo cáo bàn giao.
 */
const SubjectsTable = memo(function SubjectsTable() {
  const canCreate = useAuthStore((s) => s.hasPermission('roadmap', 'create'));
  const qp = useQueryParams({ searchKey: 'q' });
  const status = qp.getParam('status') || 'all';
  const debouncedSearch = useDebounce(qp.search.trim(), 300);
  const { inputProps } = useImeSafeSearchInput(qp.search, qp.setSearch);

  const params = useMemo<AdminSubjectsParams>(
    () => ({
      ...(status !== 'all' && { status: status as AdminSubjectsParams['status'] }),
      ...(debouncedSearch && { q: debouncedSearch }),
    }),
    [debouncedSearch, status],
  );
  const { data, isLoading, isError, refetch } = useAdminSubjects(params);
  const rows = data ?? [];
  const columns = useMemo(() => buildSubjectColumns(), []);
  const rowKey = useCallback((s: AdminSubjectRow) => s.id, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            {...inputProps}
            clearable
            placeholder="Tìm theo tên lộ trình…"
            size="sm"
            startIcon={<SystemIcon name="magnifying-glass-outline" size={16} />}
            wrapperClassName="w-64"
          />
          <Dropdown
            aria-label="Lọc theo trạng thái"
            className="w-44"
            options={STATUS_FILTER_OPTIONS}
            size="sm"
            value={status}
            onValueChange={(v) => qp.setParam('status', v === 'all' ? null : v)}
          />
        </div>
        {canCreate && (
          <Button asChild size="sm" variant="primary">
            <Link to="/roadmap/subjects/new">Tạo lộ trình</Link>
          </Button>
        )}
      </div>

      {isError && (
        <Callout
          action={
            <Button size="sm" variant="stroke" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
          description="Kiểm tra kết nối rồi thử lại."
          intent="error"
          title="Không tải được danh sách lộ trình"
        />
      )}
      {(!isError || data) && (
        <Table
          columns={columns}
          data={rows}
          emptyMessage={
            debouncedSearch ? `Không có lộ trình nào khớp "${debouncedSearch}"` : 'Chưa có lộ trình nào'
          }
          loading={isLoading}
          pagination={false}
          rowKey={rowKey}
        />
      )}
    </div>
  );
});

export default SubjectsTable;

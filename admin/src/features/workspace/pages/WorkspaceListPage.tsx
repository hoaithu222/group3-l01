import { memo } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import {
  Badge,
  BoxPanel,
  Button,
  Dropdown,
  Input,
  PageBody,
  PageShell,
  RangeDatePicker,
  Toolbar,
} from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { PageHeader } from '@/shared/widgets/header';

import WorkspaceLoadError from '../components/WorkspaceLoadError';
import WorkspaceOwnerFilter from '../components/WorkspaceOwnerFilter';
import WorkspaceTable from '../components/WorkspaceTable';
import { WORKSPACE_SORT_OPTIONS, WORKSPACE_STATUS_OPTIONS } from '../constants/workspace.constants';
import { useWorkspaceListFilters } from '../hooks';
import { useAdminWorkspaces } from '../service/workspace.queries';
import type { AdminWorkspaceRow } from '../types/workspace.types';

const STATUS_FILTER_OPTIONS = [{ value: 'all', label: 'Mọi trạng thái' }, ...WORKSPACE_STATUS_OPTIONS];

/**
 * Danh bạ workspace (admin.md p1-01 §2.1) — bảng + tìm IME-safe + lọc trạng thái + chủ sở hữu + khoảng ngày tạo +
 * sắp xếp + phân trang, tất cả đồng bộ URL (`useWorkspaceListFilters`). Không có nút "Tạo" — workspace do người
 * dùng tạo trong app, không tạo được từ admin.
 *
 * Lọc chủ sở hữu cần `user:view` để có hộp chọn (gợi ý lấy từ `GET /users`); thiếu quyền thì link `?ownerId=` vẫn lọc
 * được và hiện thành huy hiệu, chỉ không đổi được từ đây.
 */
const WorkspaceListPage = memo(function WorkspaceListPage() {
  const navigate = useNavigate();
  const canViewUser = useAuthStore((s) => s.hasPermission('user', 'view'));
  const filters = useWorkspaceListFilters();
  const { qp, values } = filters;

  const { data, isLoading, isError, error, refetch } = useAdminWorkspaces(filters.params);

  // URL chỉ mang id — mọi hàng của một lượt lọc theo chủ sở hữu đều có cùng chủ, nên lấy tên từ hàng đầu tiên khớp.
  const ownerName = values.ownerId
    ? data?.data.find((r) => r.owner?.id === values.ownerId)?.owner?.name
    : undefined;

  // Tương đối theo route hiện tại (`/workspace`) — KHÔNG dùng `MODULE_PATHS`:
  // trang này chính là đích `page.lazy` của registry, import ngược lại tạo
  // vòng (`npm run check:cycles`), giống lý do nêu ở `UserDetailPage.tsx`.
  const handleRowClick = (row: AdminWorkspaceRow) => navigate(row.id);

  return (
    <PageShell>
      <PageHeader title="Workspace" tone="teal" />
      <Toolbar
        left={
          <>
            <Input
              {...filters.inputProps}
              clearable
              placeholder="Tìm theo tên nhóm…"
              size="sm"
              startIcon={<SystemIcon name="magnifying-glass-outline" size={16} />}
              wrapperClassName="w-64"
            />
            <Dropdown
              aria-label="Lọc theo trạng thái"
              className="w-40"
              options={STATUS_FILTER_OPTIONS}
              size="sm"
              value={values.status}
              onValueChange={filters.setStatus}
            />
            {canViewUser ? (
              <WorkspaceOwnerFilter
                ownerId={values.ownerId}
                ownerName={ownerName}
                onChange={(next) => filters.setOwnerId(next?.id ?? null)}
              />
            ) : (
              values.ownerId && (
                <Badge color="primary" variant="tinted">
                  {`Chủ sở hữu: ${ownerName ?? `…${values.ownerId.slice(-6)}`}`}
                </Badge>
              )
            )}
            <RangeDatePicker
              align="start"
              className="w-64"
              placeholder="Khoảng ngày tạo"
              range={values.range}
              showQuickSelect
              size="sm"
              onRangeChange={filters.setRange}
            />
            <Dropdown
              aria-label="Sắp xếp danh sách"
              className="w-48"
              options={[...WORKSPACE_SORT_OPTIONS]}
              size="sm"
              value={values.sort}
              onValueChange={filters.setSort}
            />
            {filters.hasActiveFilter && (
              <Button size="sm" variant="ghost" onClick={filters.clear}>
                Xoá bộ lọc
              </Button>
            )}
          </>
        }
      />
      <PageBody overflow="hidden" stack={false}>
        <BoxPanel bodyOverflow="hidden" border="hairline" title="Danh bạ workspace">
          {/* Lỗi mà chưa có dữ liệu: đừng vẽ bảng trống — "không có workspace nào" là nói dối khi BE đang lỗi. */}
          {isError && !data ? (
            <div className="p-2">
              <WorkspaceLoadError
                error={error}
                title="Không tải được danh bạ workspace"
                onRetry={() => void refetch()}
              />
            </div>
          ) : (
            <WorkspaceTable
              currentPage={qp.page}
              loading={isLoading}
              pageSize={qp.pageSize}
              rows={data?.data ?? []}
              total={data?.meta?.total ?? 0}
              onPageChange={qp.setPage}
              onPageSizeChange={qp.setPageSize}
              onRowClick={handleRowClick}
            />
          )}
        </BoxPanel>
      </PageBody>
    </PageShell>
  );
});

export default WorkspaceListPage;

import { memo, useMemo } from 'react';

import {
  BoxPanel,
  Button,
  Callout,
  Dropdown,
  Input,
  PageBody,
  PageShell,
  Toolbar,
} from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { useDebounce, useDisclosure, useImeSafeSearchInput, useQueryParams } from '@/shared/hooks';
import { PageHeader } from '@/shared/widgets/header';

import CreateUserModal from '../components/CreateUserModal';
import UserDetailDrawer from '../components/UserDetailDrawer';
import UserTable from '../components/UserTable';
import { BIOMETRIC_STATUS_PARAM } from '../constants/biometric.constants';
import { USER_ROLE_OPTIONS, USER_STATUS_OPTIONS } from '../constants/user.constants';
import { useUserList } from '../service/user.queries';
import type { AdminUser } from '../types/user.types';

const ROLE_FILTER_OPTIONS = [{ value: 'all', label: 'Mọi vai trò' }, ...USER_ROLE_OPTIONS];
const STATUS_FILTER_OPTIONS = [{ value: 'all', label: 'Mọi trạng thái' }, ...USER_STATUS_OPTIONS];

/**
 * Danh sách người dùng — bảng + tìm IME-safe + lọc vai trò/trạng thái + phân
 * trang, tất cả đồng bộ URL (`useQueryParams`). Bố cục chép từ `/demo/ghep`
 * (`ComposedDemoPage`) — xem file đó để hiểu chuỗi chiều cao `PageBody` →
 * `BoxPanel` → `Table`.
 *
 * `?id=` điều khiển `UserDetailDrawer` mở/đóng — giữ NGUYÊN list phía sau
 * (không điều hướng sang route khác) để không mất filter/scroll đang xem.
 * `UserDetailPage` (route `/user/:id`, deep-link cũ) chỉ redirect về đây.
 */
const UserListPage = memo(function UserListPage() {
  const qp = useQueryParams({ defaultPageSize: 20 });
  const { inputProps } = useImeSafeSearchInput(qp.search, qp.setSearch);
  const debouncedSearch = useDebounce(qp.search, 300);
  const roleFilter = qp.getParam('role', 'all');
  const statusFilter = qp.getParam('status', 'all');
  const detailId = qp.getParam('id') || null;
  const createModal = useDisclosure();

  const params = useMemo(
    () => ({
      q: debouncedSearch || undefined,
      role: roleFilter !== 'all' ? roleFilter : undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      page: qp.page,
      limit: qp.pageSize,
    }),
    [debouncedSearch, roleFilter, statusFilter, qp.page, qp.pageSize],
  );

  const { data, isLoading, isError, refetch } = useUserList(params);

  const handleRowClick = (row: AdminUser) => qp.setParam('id', row.id);
  // `bioStatus` là bộ lọc riêng của tab Phiên trong drawer — đóng drawer thì bỏ
  // luôn, khỏi rơi vào lần mở người dùng khác. `updateParams` (không reset `?page=`).
  const handleCloseDrawer = () => qp.updateParams({ id: null, [BIOMETRIC_STATUS_PARAM]: null });

  return (
    <PageShell>
      <PageHeader title="Người dùng" tone="blue" />
      <Toolbar
        left={
          <>
            <Input
              {...inputProps}
              clearable
              placeholder="Tìm theo tên, email…"
              size="sm"
              startIcon={<SystemIcon name="magnifying-glass-outline" size={16} />}
              wrapperClassName="w-64"
            />
            <Dropdown
              aria-label="Lọc theo vai trò"
              className="w-40"
              options={ROLE_FILTER_OPTIONS}
              size="sm"
              value={roleFilter}
              onValueChange={(v) => qp.setParam('role', v === 'all' ? null : v)}
            />
            <Dropdown
              aria-label="Lọc theo trạng thái"
              className="w-40"
              options={STATUS_FILTER_OPTIONS}
              size="sm"
              value={statusFilter}
              onValueChange={(v) => qp.setParam('status', v === 'all' ? null : v)}
            />
          </>
        }
        right={
          <Button
            size="sm"
            startIcon={<SystemIcon name="plus-outline" size={14} />}
            onClick={createModal.open}
          >
            Tạo người dùng
          </Button>
        }
      />
      <PageBody overflow="hidden" stack={false}>
        <BoxPanel bodyOverflow="hidden" border="hairline" title="Danh sách người dùng">
          {isError && (
            <div className="shrink-0 p-2">
              <Callout
                action={
                  <Button size="sm" variant="stroke" onClick={() => void refetch()}>
                    Thử lại
                  </Button>
                }
                description="Kiểm tra kết nối rồi thử lại."
                intent="error"
                title="Không tải được danh sách người dùng"
              />
            </div>
          )}
          {/* Lỗi mà chưa có dữ liệu: đừng vẽ bảng trống — "Không có người dùng nào khớp bộ lọc" là nói dối. */}
          {(!isError || data) && (
            <UserTable
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

      <UserDetailDrawer userId={detailId} onClose={handleCloseDrawer} />
      <CreateUserModal
        open={createModal.isOpen}
        onOpenChange={(next) => !next && createModal.close()}
      />
    </PageShell>
  );
});

export default UserListPage;

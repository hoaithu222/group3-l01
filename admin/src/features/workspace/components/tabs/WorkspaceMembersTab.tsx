import { memo, useMemo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import { BoxPanel, Dropdown, Input, Modal, Toolbar } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { useDebounce, useDisclosure, useImeSafeSearchInput, useQueryParams } from '@/shared/hooks';
import { AuditTrailPanel } from '@/shared/widgets/audit-trail';

import WorkspaceAccessSection from '../WorkspaceAccessSection';
import WorkspaceLoadError from '../WorkspaceLoadError';
import WorkspaceMemberCounts from '../WorkspaceMemberCounts';
import WorkspaceMemberTable from '../WorkspaceMemberTable';
import {
  MEMBER_ROLE_FILTER_OPTIONS,
  MEMBER_SORT_OPTIONS,
  MEMBER_STATUS_FILTER_OPTIONS,
} from '../../constants/workspace-members.constants';
import {
  useAdminWorkspaceMembers,
  useReloadMembers,
} from '../../service/workspace-members.queries';
import type { AdminListMembersParams, AdminMemberRow } from '../../types/workspace-members.types';
import RevokeMemberModal from './RevokeMemberModal';

const ROLE_FILTER_OPTIONS = [{ value: 'all', label: 'Mọi vai trò' }, ...MEMBER_ROLE_FILTER_OPTIONS];
const STATUS_FILTER_OPTIONS = [{ value: 'all', label: 'Mọi trạng thái' }, ...MEMBER_STATUS_FILTER_OPTIONS];

export interface WorkspaceMembersTabProps {
  workspaceId: string;
}

/**
 * Tab "Thành viên" của `WorkspaceDetailPage` (admin.md p1-02 §2): ba thẻ đếm (`WorkspaceMemberCounts`, đọc từ
 * `access-summary`), bộ lọc, bảng thành viên (tải lỗi → banner + "Thử lại", không vẽ bảng trống) và phần khách/
 * lời mời/yêu cầu tham gia của p3-04.
 */
const WorkspaceMembersTab = memo(function WorkspaceMembersTab({
  workspaceId,
}: WorkspaceMembersTabProps) {
  const canRevoke = useAuthStore((s) => s.hasPermission('workspace', 'update'));
  const canViewAuditLog = useAuthStore((s) => s.hasPermission('audit-log', 'view'));

  const qp = useQueryParams({ defaultPageSize: 20 });
  const { inputProps } = useImeSafeSearchInput(qp.search, qp.setSearch);
  const debouncedSearch = useDebounce(qp.search, 300);
  const roleFilter = qp.getParam('role', 'all');
  const statusFilter = qp.getParam('status', 'all');
  const sortFilter = qp.getParam('sort', 'joinedAt');

  const params = useMemo<AdminListMembersParams>(
    () => ({
      q: debouncedSearch || undefined,
      role: roleFilter !== 'all' ? (roleFilter as AdminListMembersParams['role']) : undefined,
      status: statusFilter !== 'all' ? (statusFilter as AdminListMembersParams['status']) : undefined,
      sort: sortFilter as AdminListMembersParams['sort'],
      page: qp.page,
      limit: qp.pageSize,
    }),
    [debouncedSearch, roleFilter, statusFilter, sortFilter, qp.page, qp.pageSize],
  );

  const { data, isLoading, isError, error } = useAdminWorkspaceMembers(workspaceId, params);
  const reloadMembers = useReloadMembers(workspaceId);

  const revokeModal = useDisclosure();
  const [revokeTarget, setRevokeTarget] = useState<AdminMemberRow | null>(null);
  const [auditTarget, setAuditTarget] = useState<AdminMemberRow | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <WorkspaceMemberCounts workspaceId={workspaceId} />

      <Toolbar
        left={
          <>
            <Input
              {...inputProps}
              clearable
              placeholder="Tìm theo tên…"
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
              className="w-44"
              options={STATUS_FILTER_OPTIONS}
              size="sm"
              value={statusFilter}
              onValueChange={(v) => qp.setParam('status', v === 'all' ? null : v)}
            />
            <Dropdown
              aria-label="Sắp xếp danh sách"
              className="w-48"
              options={[...MEMBER_SORT_OPTIONS]}
              size="sm"
              value={sortFilter}
              onValueChange={(v) => qp.setParam('sort', v === 'joinedAt' ? null : v)}
            />
          </>
        }
      />

      <BoxPanel border="hairline" title="Danh sách thành viên">
        {/* Lỗi mà chưa có dữ liệu: đừng vẽ bảng trống — "Chưa có thành viên" là nói dối khi BE đang lỗi. */}
        {isError && !data ? (
          <div className="p-2">
            <WorkspaceLoadError
              error={error}
              title="Không tải được danh sách thành viên"
              onRetry={() => void reloadMembers()}
            />
          </div>
        ) : (
          <WorkspaceMemberTable
            canRevoke={canRevoke}
            canViewAuditLog={canViewAuditLog}
            currentPage={qp.page}
            loading={isLoading}
            pageSize={qp.pageSize}
            rows={data?.data ?? []}
            total={data?.meta?.total ?? 0}
            onPageChange={qp.setPage}
            onPageSizeChange={qp.setPageSize}
            onRevoke={(row) => {
              setRevokeTarget(row);
              revokeModal.open();
            }}
            onViewAuditLog={(row) => setAuditTarget(row)}
          />
        )}
      </BoxPanel>

      {/* p3-04: khách, lời mời email, yêu cầu chờ duyệt — chỉ đọc. */}
      <WorkspaceAccessSection workspaceId={workspaceId} />

      {revokeTarget && (
        <RevokeMemberModal
          member={revokeTarget}
          open={revokeModal.isOpen}
          workspaceId={workspaceId}
          onOpenChange={(next) => {
            if (!next) revokeModal.close();
          }}
        />
      )}

      <Modal
        open={auditTarget !== null}
        showClose
        size="lg"
        title={auditTarget ? `Nhật ký — ${auditTarget.user.name}` : ''}
        onOpenChange={(next) => !next && setAuditTarget(null)}
      >
        {auditTarget && (
          <AuditTrailPanel
            targetId={`${workspaceId}:${auditTarget.user.id}`}
            targetType="WorkspaceMembership"
          />
        )}
      </Modal>
    </div>
  );
});

export default WorkspaceMembersTab;

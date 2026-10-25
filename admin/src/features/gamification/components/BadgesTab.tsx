import { memo, useCallback, useMemo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import { Button, Callout, ConfirmWithReasonModal, Table } from '@/shared/ui';
import { useDebounce, useNavHref, useQueryParams } from '@/shared/hooks';

import { BADGES_PAGE_SIZE } from '../constants/gamification.labels';
import { useAdminBadges, useBackfillBadge, usePatchBadge } from '../service/gamification.queries';
import type { AdminBadge, AdminBadgesParams } from '../types/gamification.types';
import BadgeDetailDrawer from './BadgeDetailDrawer';
import BadgeFormModal from './BadgeFormModal';
import BadgesToolbar, { type BadgeActiveFilter } from './BadgesToolbar';
import { buildBadgeColumns } from './badges-table.columns';

/**
 * Tab "Huy hiệu" (admin.md p4-03 §2.2) — danh sách phân trang server, tìm theo tên (`?q=`, IME-safe, phía SERVER), lọc Bật/Tắt, Tắt/Bật qua
 * `ConfirmWithReasonModal` → `PATCH /admin/badges/:id { isActive, expectedVersion, reason }`. Tìm kiếm, lọc, trang và ngăn kéo chi tiết
 * (`?badgeId=`, deep link `/gamification/badges/:badgeId` chuyển hướng về đây) đều đồng bộ URL. Tạo/Sửa qua `BadgeFormModal`; "Cấp bù" →
 * `POST /admin/badges/:id/backfill` (job nền); nhật ký nằm trong ngăn kéo. Ảnh: xem `BadgeIcon` (giới hạn phía BE).
 */
const BadgesTab = memo(function BadgesTab() {
  const canUpdate = useAuthStore((s) => s.hasPermission('gamification', 'update'));
  const qp = useQueryParams({ searchKey: 'q' });
  const buildHref = useNavHref();
  const { updateParams } = qp;
  const activeParam = qp.getParam('active');
  const filter: BadgeActiveFilter = activeParam === 'true' || activeParam === 'false' ? activeParam : 'all';
  const badgeId = qp.getParam('badgeId') || null;
  const debouncedSearch = useDebounce(qp.search.trim(), 300);

  const [toggling, setToggling] = useState<AdminBadge | null>(null);
  /** `undefined` = đóng; `null` = tạo mới; badge = sửa. */
  const [editing, setEditing] = useState<AdminBadge | null | undefined>(undefined);
  const [backfilling, setBackfilling] = useState<AdminBadge | null>(null);
  const backfill = useBackfillBadge();
  const patch = usePatchBadge();

  const params = useMemo<AdminBadgesParams>(
    () => ({
      page: qp.page,
      limit: BADGES_PAGE_SIZE,
      ...(filter !== 'all' && { isActive: filter }),
      ...(debouncedSearch && { q: debouncedSearch }),
    }),
    [debouncedSearch, filter, qp.page],
  );
  const { data, isLoading, isError, refetch } = useAdminBadges(params);

  const handleToggle = useCallback(
    async (reason: string) => {
      if (!toggling) return;
      await patch.mutateAsync({ id: toggling.id, isActive: !toggling.isActive, expectedVersion: toggling.version, reason });
      setToggling(null);
    },
    [patch, toggling],
  );

  const handleBackfill = useCallback(
    async (reason: string) => {
      if (!backfilling) return;
      await backfill.mutateAsync({ id: backfilling.id, reason });
      setBackfilling(null);
    },
    [backfill, backfilling],
  );

  const columns = useMemo(
    () =>
      buildBadgeColumns({
        canUpdate,
        hrefFor: (b) => buildHref({ badgeId: b.id }),
        onOpen: (b) => updateParams({ badgeId: b.id }),
        onEdit: setEditing,
        onToggle: setToggling,
        onBackfill: setBackfilling,
      }),
    [buildHref, canUpdate, updateParams],
  );

  const rowKey = useCallback((b: AdminBadge) => b.id, []);
  const rows = useMemo(() => data?.data ?? [], [data]);

  return (
    <div className="flex flex-col gap-3">
      <BadgesToolbar
        canCreate={canUpdate}
        filter={filter}
        search={qp.search}
        onCreate={() => setEditing(null)}
        onFilterChange={(v) => qp.setParam('active', v === 'all' ? null : v)}
        onSearchChange={qp.setSearch}
      />
      {isError && (
        <Callout
          action={
            <Button size="sm" variant="stroke" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
          description="Kiểm tra kết nối rồi thử lại."
          intent="error"
          title="Không tải được danh sách huy hiệu"
        />
      )}
      {/* Lỗi mà chưa có dữ liệu: đừng vẽ bảng trống — "Chưa có huy hiệu nào" là nói dối. */}
      {(!isError || data) && (
        <Table
          columns={columns}
          currentPage={qp.page}
          data={rows}
          emptyMessage={debouncedSearch ? `Không có huy hiệu nào khớp "${debouncedSearch}"` : 'Chưa có huy hiệu nào'}
          loading={isLoading}
          pageSize={BADGES_PAGE_SIZE}
          rowKey={rowKey}
          total={data?.meta?.total ?? 0}
          onPageChange={qp.setPage}
        />
      )}
      <BadgeDetailDrawer
        badgeId={badgeId}
        canUpdate={canUpdate}
        onBackfill={setBackfilling}
        onClose={() => updateParams({ badgeId: null })}
        onEdit={setEditing}
        onToggle={setToggling}
      />
      <ConfirmWithReasonModal
        confirmTone={toggling?.isActive ? 'danger' : 'primary'}
        impact={
          toggling
            ? toggling.isActive
              ? `Tắt "${toggling.name}": người dùng mới không mở được huy hiệu này; người đã đạt vẫn giữ.`
              : `Bật lại "${toggling.name}": người dùng đủ điều kiện sẽ mở được huy hiệu từ sự kiện tiếp theo.`
            : null
        }
        open={!!toggling}
        title={toggling?.isActive ? 'Tắt huy hiệu' : 'Bật huy hiệu'}
        onConfirm={handleToggle}
        onOpenChange={(open) => !open && setToggling(null)}
      />
      <ConfirmWithReasonModal
        impact={
          backfilling
            ? `Cấp "${backfilling.name}" cho mọi người ĐANG đủ điều kiện (chạy nền, mỗi người nhận tối đa một thông báo).`
            : null
        }
        open={!!backfilling}
        title="Cấp cho người đã đủ điều kiện"
        onConfirm={handleBackfill}
        onOpenChange={(open) => !open && setBackfilling(null)}
      />
      {editing !== undefined ? (
        <BadgeFormModal key={editing?.id ?? 'new'} badge={editing} open onClose={() => setEditing(undefined)} />
      ) : null}
    </div>
  );
});

export default BadgesTab;

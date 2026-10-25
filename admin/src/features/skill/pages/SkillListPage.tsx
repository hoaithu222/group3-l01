import { memo, useCallback, useMemo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import {
  Button,
  Callout,
  ConfirmWithReasonModal,
  PageBody,
  PageShell,
  Table,
} from '@/shared/ui';
import { useDebounce, useDisclosure, useQueryParams } from '@/shared/hooks';
import { PageHeader } from '@/shared/widgets/header';
import { formatNumber } from '@/shared/utils/format';

import SkillsToolbar, { type SkillActiveFilter } from '../components/SkillsToolbar';
import { buildSkillColumns } from '../components/skills-table.columns';
import { SKILLS_PAGE_SIZE } from '../constants/skill.constants';
import { useAdminSkills, useReevaluateSkills, useSetSkillActive } from '../service/skill.queries';
import type { AdminSkill, AdminSkillsParams, SkillCategory } from '../types/skill.types';

/**
 * `/skill` — danh mục kỹ năng xác thực (admin.md p6-06 §2.1). Tìm `?q=` (IME-safe, lọc SERVER), lọc nhóm/trạng thái, phân trang — đều đồng bộ URL.
 * Bật/Tắt qua `ConfirmWithReasonModal` (bật = cấp cho người đã đủ; tắt không thu hồi huy hiệu đã cấp). "Đánh giá lại toàn bộ" giới hạn 1 lần/giờ.
 */
const SkillListPage = memo(function SkillListPage() {
  const canCreate = useAuthStore((s) => s.hasPermission('skill', 'create'));
  const canUpdate = useAuthStore((s) => s.hasPermission('skill', 'update'));
  const qp = useQueryParams({ searchKey: 'q' });
  const activeParam = qp.getParam('active');
  const status: SkillActiveFilter =
    activeParam === 'true' || activeParam === 'false' ? activeParam : 'all';
  const category = qp.getParam('category') ?? '';
  const debouncedSearch = useDebounce(qp.search.trim(), 300);
  const [toggling, setToggling] = useState<AdminSkill | null>(null);
  const reevaluateModal = useDisclosure();
  const setActive = useSetSkillActive();
  const reevaluate = useReevaluateSkills();

  const params = useMemo<AdminSkillsParams>(
    () => ({
      page: qp.page,
      limit: SKILLS_PAGE_SIZE,
      ...(status !== 'all' && { active: status }),
      ...(category && { category: category as SkillCategory }),
      ...(debouncedSearch && { q: debouncedSearch }),
    }),
    [category, debouncedSearch, qp.page, status],
  );
  const { data, isLoading, isError, refetch } = useAdminSkills(params);

  const handleToggle = useCallback(
    async (reason: string) => {
      if (!toggling) return;
      await setActive.mutateAsync({ id: toggling.id, active: !toggling.isActive, reason });
      setToggling(null);
    },
    [setActive, toggling],
  );

  const handleReevaluate = useCallback(
    async (reason: string) => {
      await reevaluate.mutateAsync({ reason });
      reevaluateModal.close();
    },
    [reevaluate, reevaluateModal],
  );

  const columns = useMemo(
    () => buildSkillColumns({ canUpdate, onToggle: setToggling }),
    [canUpdate],
  );
  const rowKey = useCallback((s: AdminSkill) => s.id, []);
  const rows = useMemo(() => data?.data ?? [], [data]);

  return (
    <PageShell>
      <PageHeader title="Kỹ năng xác thực" tone="emerald" />
      <PageBody overflow="scroll">
        <div className="flex flex-col gap-3">
          <SkillsToolbar
            canCreate={canCreate}
            canReevaluate={canUpdate}
            category={category}
            search={qp.search}
            status={status}
            onCategoryChange={(v) => qp.setParam('category', v)}
            onReevaluate={reevaluateModal.open}
            onSearchChange={qp.setSearch}
            onStatusChange={(v) => qp.setParam('active', v === 'all' ? null : v)}
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
              title="Không tải được danh sách kỹ năng"
            />
          )}
          {(!isError || data) && (
            <Table
              columns={columns}
              currentPage={qp.page}
              data={rows}
              emptyMessage={
                debouncedSearch
                  ? `Không có kỹ năng nào khớp "${debouncedSearch}"`
                  : 'Chưa có kỹ năng nào'
              }
              loading={isLoading}
              pageSize={SKILLS_PAGE_SIZE}
              rowKey={rowKey}
              total={data?.meta?.total ?? 0}
              onPageChange={qp.setPage}
            />
          )}
        </div>
      </PageBody>
      <ConfirmWithReasonModal
        confirmTone={toggling?.isActive ? 'danger' : 'primary'}
        impact={
          toggling
            ? toggling.isActive
              ? `Tắt "${toggling.name}": không cấp thêm huy hiệu; ${formatNumber(toggling.holdersCount)} người đang giữ vẫn giữ nguyên.`
              : `Bật "${toggling.name}": hệ thống cấp huy hiệu cho mọi người ĐÃ đủ tiêu chí (chạy nền, mỗi người một thông báo).`
            : null
        }
        open={!!toggling}
        title={toggling?.isActive ? 'Tắt kỹ năng' : 'Bật kỹ năng'}
        onConfirm={handleToggle}
        onOpenChange={(open) => !open && setToggling(null)}
      />
      <ConfirmWithReasonModal
        impact="Đánh giá lại mọi kỹ năng đang bật và cấp cho người đủ tiêu chí mà chưa có huy hiệu (huy hiệu đã thu hồi không cấp lại). Tối đa 1 lần mỗi giờ."
        open={reevaluateModal.isOpen}
        title="Đánh giá lại toàn bộ"
        onConfirm={handleReevaluate}
        onOpenChange={(open) => !open && reevaluateModal.close()}
      />
    </PageShell>
  );
});

export default SkillListPage;

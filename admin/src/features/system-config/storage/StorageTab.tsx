import { memo, useCallback, useMemo } from 'react';

import { useAuthStore } from '@/app/store';
import { BoxPanel, Button, Callout, Skeleton, Toolbar } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { useQueryParams } from '@/shared/hooks';
import { cn } from '@/shared/utils/style';
import { WorkspacePicker } from '@/shared/widgets/workspace-picker';
import type { WorkspaceOption } from '@/shared/widgets/workspace-picker';

import StorageByScopeChart from './components/StorageByScopeChart';
import StorageCleanupButton from './components/StorageCleanupButton';
import StorageLimits from './components/StorageLimits';
import StorageQuotaSection from './components/StorageQuotaSection';
import StorageSummary from './components/StorageSummary';
import StorageTables from './components/StorageTables';
import {
  OBJECT_ID_RE,
  STORAGE_WORKSPACE_NAME_PARAM,
  STORAGE_WORKSPACE_PARAM,
} from './constants/storage.constants';
import { useStorageStats } from './service/storage.queries';

/**
 * Tab "Lưu trữ" của `system-config` (admin.md p0-05 §2.1): số liệu dung lượng theo scope / loại
 * tệp / trạng thái, lọc theo workspace, giới hạn hiện hành (chỉ đọc) và "Chạy dọn tệp mồ côi
 * ngay". Không có danh sách tệp theo người dùng/nội dung — riêng tư (chỉ số liệu tổng hợp).
 *
 * Workspace đang lọc nằm trên URL (`storageWs` + `storageWsName` để hiện tên không cần gọi lại
 * BE); id sai định dạng bị bỏ qua thay vì gửi BE ăn `VAL_001`.
 */
const StorageTab = memo(function StorageTab() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canUpdate = hasPermission('system-config', 'update');
  // Gợi ý workspace lấy từ `GET /admin/workspaces` (cần `workspace:view`) — thiếu thì ẩn bộ lọc.
  const canPickWorkspace = hasPermission('workspace', 'view');

  const { getParam, updateParams } = useQueryParams();
  const rawId = getParam(STORAGE_WORKSPACE_PARAM);
  const workspaceId = OBJECT_ID_RE.test(rawId) ? rawId : undefined;
  const workspaceName = getParam(STORAGE_WORKSPACE_NAME_PARAM);
  const selected = useMemo<WorkspaceOption | null>(
    () => (workspaceId ? { id: workspaceId, name: workspaceName || workspaceId } : null),
    [workspaceId, workspaceName],
  );

  const { data, isLoading, isError, isFetching, isPlaceholderData, refetch } =
    useStorageStats(workspaceId);

  const handleWorkspace = useCallback(
    (next: WorkspaceOption | null) =>
      updateParams({
        [STORAGE_WORKSPACE_PARAM]: next?.id ?? null,
        [STORAGE_WORKSPACE_NAME_PARAM]: next?.name ?? null,
      }),
    [updateParams],
  );

  return (
    <div className="flex flex-col gap-3">
      <Callout
        description="Chỉ hiện số liệu tổng hợp — quản trị nền tảng không xem tên tệp hay nội dung của người dùng."
        icon="lock-bold"
        intent="neutral"
        variant="ghost"
      />

      <Toolbar
        left={
          canPickWorkspace ? (
            <WorkspacePicker allLabel="Toàn hệ thống" value={selected} onChange={handleWorkspace} />
          ) : null
        }
        right={
          <>
            <Button
              loading={isFetching}
              size="sm"
              startIcon={<SystemIcon name="arrows-rotate-outline" size={16} />}
              variant="ghost"
              onClick={() => void refetch()}
            >
              Làm mới
            </Button>
            {canUpdate && <StorageCleanupButton />}
          </>
        }
      />

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : isError || !data ? (
        <Callout
          action={
            <Button size="sm" variant="stroke" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
          intent="error"
          title="Không tải được số liệu lưu trữ"
        />
      ) : (
        // Đổi workspace: giữ số cũ mờ đi tới khi số mới về (không nháy skeleton, không đọc nhầm số cũ là mới).
        <div className={cn('flex flex-col gap-3', isPlaceholderData && 'opacity-50')}>
          <StorageSummary stats={data} />
          <BoxPanel border="hairline" title="Dung lượng theo phạm vi">
            <div className="h-64">
              <StorageByScopeChart data={data.byScope} />
            </div>
          </BoxPanel>
          <StorageTables stats={data} />
        </div>
      )}

      <StorageLimits />
      {/* p3-01: hạn mức kho tài liệu (mặc định / thùng rác) + hạn mức riêng theo nhóm (json). */}
      <StorageQuotaSection />
    </div>
  );
});

export default StorageTab;

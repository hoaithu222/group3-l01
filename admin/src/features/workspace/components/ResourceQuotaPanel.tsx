import { memo } from 'react';

import { useAuthStore } from '@/app/store';
import { Badge, BoxPanel, Button, ConfirmWithReasonModal, Text } from '@/shared/ui';
import { useDisclosure } from '@/shared/hooks';
import { formatFileSize } from '@/shared/utils/format';

import { useResetResourceQuota } from '../service/workspace-resources.queries';
import type { ResourceStatsView } from '../types/workspace-resources.types';
import ResourceQuotaModal from './ResourceQuotaModal';

export interface ResourceQuotaPanelProps {
  workspaceId: string;
  stats: ResourceStatsView;
  /** Tải lại số liệu tab và trả hạn mức mới (byte) — dùng khi 409 trong modal. */
  onReload: () => Promise<number | undefined>;
}

/**
 * Khối "Hạn mức riêng" (p3-01 admin.md §2.1): giá trị hiện hành (mặc định/ghi đè) + hành động.
 * Ghi hạn mức cần `system-config:update` (BE cũng kiểm) — thiếu quyền thì KHÔNG có nút nào.
 */
const ResourceQuotaPanel = memo(function ResourceQuotaPanel({
  workspaceId,
  stats,
  onReload,
}: ResourceQuotaPanelProps) {
  const canUpdate = useAuthStore((s) => s.hasPermission('system-config', 'update'));
  const setModal = useDisclosure();
  const resetModal = useDisclosure();
  const resetQuota = useResetResourceQuota(workspaceId);
  const isOverride = stats.quotaSource === 'OVERRIDE';

  return (
    <BoxPanel
      border="hairline"
      className="h-auto"
      headerRight={
        canUpdate ? (
          <div className="flex items-center gap-2">
            {isOverride && (
              <Button size="sm" variant="ghost" onClick={resetModal.open}>
                Về mặc định
              </Button>
            )}
            <Button size="sm" variant="stroke" onClick={setModal.open}>
              Đặt hạn mức riêng
            </Button>
          </div>
        ) : undefined
      }
      title="Hạn mức riêng"
    >
      <div className="flex flex-wrap items-center gap-2 p-2">
        <Text className="tabular-nums" size="small" weight="medium">
          {formatFileSize(stats.quotaBytes)}
        </Text>
        <Badge color={isOverride ? 'warning' : 'neutral'} variant="tinted">
          {isOverride ? 'Ghi đè cho nhóm này' : 'Theo mặc định của hệ thống'}
        </Badge>
        {!canUpdate && (
          <Text size="tiny" skin="muted">
            Chỉ tài khoản có quyền sửa cấu hình hệ thống mới đổi được hạn mức.
          </Text>
        )}
      </div>

      {setModal.isOpen && (
        <ResourceQuotaModal
          currentBytes={stats.quotaBytes}
          open
          workspaceId={workspaceId}
          onOpenChange={(next) => !next && setModal.close()}
          onReload={onReload}
        />
      )}
      <ConfirmWithReasonModal
        confirmLabel="Về mặc định"
        impact="Nhóm dùng lại hạn mức mặc định của hệ thống. Không xoá tệp nào của nhóm."
        open={resetModal.isOpen}
        title="Về hạn mức mặc định"
        onConfirm={async (reason) => {
          await resetQuota.mutateAsync({ reason });
        }}
        onOpenChange={(next) => !next && resetModal.close()}
      />
    </BoxPanel>
  );
});

export default ResourceQuotaPanel;

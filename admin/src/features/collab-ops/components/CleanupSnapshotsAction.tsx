import { memo, useCallback } from 'react';

import { useAuthStore } from '@/app/store';
import { Button, ConfirmWithReasonModal } from '@/shared/ui';
import { useDisclosure } from '@/shared/hooks';

import { useCleanupCollabSnapshots } from '../service/collab-ops.queries';

/**
 * Nút "Chạy dọn bản lưu tự động ngay" (admin.md p6-01 §2.1) — cần `system-config:update` (BE cũng chặn bằng quyền này); thiếu quyền thì KHÔNG
 * có nút. Xác nhận bằng `ConfirmWithReasonModal` (lý do 10–500 ký tự) → `POST /admin/collab/cleanup-snapshots`, BE ghi audit `collab.cleanup-snapshots`.
 * Chỉ dọn bản lưu TỰ ĐỘNG vượt trần; bản lưu thủ công của người dùng không đụng tới.
 */
const CleanupSnapshotsAction = memo(function CleanupSnapshotsAction() {
  const canUpdate = useAuthStore((s) => s.hasPermission('system-config', 'update'));
  const modal = useDisclosure();
  const cleanup = useCleanupCollabSnapshots();

  const confirm = useCallback(
    async (reason: string) => {
      await cleanup.mutateAsync(reason);
      modal.close();
    },
    [cleanup, modal],
  );

  if (!canUpdate) return null;

  return (
    <>
      <Button size="sm" variant="stroke" onClick={modal.open}>
        Chạy dọn bản lưu tự động ngay
      </Button>
      <ConfirmWithReasonModal
        confirmLabel="Chạy dọn"
        impact="Xoá các bản lưu TỰ ĐỘNG vượt số lượng tối đa ở mọi tài liệu (giữ các bản mới nhất). Bản lưu thủ công của người dùng không bị ảnh hưởng. Không hoàn tác được."
        open={modal.isOpen}
        title="Dọn bản lưu tự động"
        onConfirm={confirm}
        onOpenChange={(next) => {
          if (!next) modal.close();
        }}
      />
    </>
  );
});

export default CleanupSnapshotsAction;

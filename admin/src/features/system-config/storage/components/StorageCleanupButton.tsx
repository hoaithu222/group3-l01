import { memo } from 'react';

import { Button, ConfirmWithReasonModal } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { useDisclosure } from '@/shared/hooks';

import { useCleanupStorage } from '../service/storage.queries';

const IMPACT =
  'Xoá vĩnh viễn các tệp chưa gắn vào nội dung nào và đã quá thời hạn chờ (mặc định 24 giờ). ' +
  'Mỗi lượt xử lý một lô tối đa 500 tệp, chạy nền — số liệu cập nhật sau ít giây. ' +
  'Áp dụng cho toàn hệ thống (không riêng workspace đang lọc); mỗi giờ chỉ chạy tay được một lượt. Không thể hoàn tác.';

/**
 * Nút "Chạy dọn tệp mồ côi ngay" + hộp xác nhận có lý do (admin.md p0-05 §2.1).
 * Chỉ dựng khi có `system-config:update` — quyết định ở `StorageTab`; BE vẫn kiểm lại.
 * `onConfirm` ném lỗi ⇒ `ConfirmWithReasonModal` giữ mở (toast lỗi do interceptor hiện).
 */
const StorageCleanupButton = memo(function StorageCleanupButton() {
  const modal = useDisclosure();
  const cleanup = useCleanupStorage();

  return (
    <>
      <Button
        size="sm"
        startIcon={<SystemIcon name="trash-can-outline" size={16} />}
        variant="stroke"
        onClick={modal.open}
      >
        Chạy dọn tệp mồ côi ngay
      </Button>
      <ConfirmWithReasonModal
        confirmLabel="Chạy dọn"
        confirmTone="danger"
        impact={IMPACT}
        open={modal.isOpen}
        title="Chạy dọn tệp mồ côi ngay"
        onConfirm={async (reason) => {
          await cleanup.mutateAsync({ reason });
        }}
        onOpenChange={(next) => !next && modal.close()}
      />
    </>
  );
});

export default StorageCleanupButton;

import { useState } from 'react';

import { ConfirmSheet } from '@/shared/ui/bottom-sheet';
import { Input } from '@/shared/ui/input';

export interface DissolveConfirmDialogProps {
  visible: boolean;
  groupTitle: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (confirmTitle: string) => void;
}

/**
 * be.md §5.5 — OWNER gõ lại ĐÚNG tên nhóm để xác nhận giải tán (so khớp NFC, không phân biệt hoa/thường ở server).
 *
 * ✅ `ConfirmSheet` + ô gõ lại tên ở khe `children` thay cho hai `Button fullWidth` trần trong `flex-row` (nút "Giải tán nhóm" bị đẩy ra
 * mép tấm). ⚠️ Bỏ khối `Alert` cảnh báo riêng: ô biểu tượng ĐỎ đầu tấm giờ là thứ mắt thấy đầu tiên, câu "không thể hoàn tác" nằm ngay
 * trong mô tả (14/20 `fg-2`, không còn là dòng chú thích xám 12 của bản gốc) — để thêm một khối cam nữa là hai lớp cảnh báo tranh nhau.
 */
export function DissolveConfirmDialog({
  visible,
  groupTitle,
  loading,
  onClose,
  onConfirm,
}: DissolveConfirmDialogProps) {
  const [value, setValue] = useState('');
  const matches =
    value.trim().length > 0 && value.trim().toLowerCase() === groupTitle.trim().toLowerCase();

  function handleClose(): void {
    setValue('');
    onClose();
  }

  return (
    <ConfirmSheet
      confirmDisabled={!matches}
      confirmLabel="Giải tán nhóm"
      description="Mọi thành viên sẽ không gửi được tin nữa, lịch sử vẫn xem được. Hành động không thể hoàn tác."
      icon="delete"
      loading={loading}
      title="Giải tán nhóm này?"
      tone="danger"
      visible={visible}
      onClose={handleClose}
      onConfirm={() => onConfirm(value.trim())}
    >
      <Input
        label={`Gõ lại tên nhóm "${groupTitle}" để xác nhận`}
        placeholder={groupTitle}
        value={value}
        onChangeText={setValue}
      />
    </ConfirmSheet>
  );
}

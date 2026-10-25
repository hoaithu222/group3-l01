import { useState } from 'react';

import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

export interface GroupRenameSheetProps {
  current: string;
  visible: boolean;
  onClose: () => void;
  onSave: (title: string) => void;
}

/** Tấm "Đổi tên nhóm" của `GroupInfo` — tách riêng để `GroupInfo.tsx` giữ dưới trần 200 dòng khi thêm phần đầu trang + các nhóm hàng. */
export function GroupRenameSheet({ current, visible, onClose, onSave }: GroupRenameSheetProps) {
  const [title, setTitle] = useState(current);
  // ⚠️ Sheet giữ mounted (chỉ bật/tắt `visible`) nên `useState(current)` chạy ĐÚNG một lần: mở lại phải lấy tên HIỆN TẠI — không
  // thì hiện chữ đã huỷ ở lần trước, hoặc tên cũ khi nhóm vừa được đổi tên ở máy khác. Đặt lại ngay trong render (mẫu React chuẩn).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setTitle(current);
  }
  return (
    <BottomSheet
      footer={<Button fullWidth label="Lưu" onPress={() => onSave(title)} />}
      title="Đổi tên nhóm"
      visible={visible}
      onClose={onClose}
    >
      <Input
        label="Tên nhóm"
        maxLength={80}
        placeholder="Đặt tên cho nhóm"
        value={title}
        onChangeText={setTitle}
      />
    </BottomSheet>
  );
}

import { useState } from 'react';

import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

/** `LIMITS.member.displayNameMax` (be.md p1-02 §9). */
const DISPLAY_NAME_MAX = 40;

export interface EditDisplayNameSheetProps {
  currentName: string | null;
  loading: boolean;
  onClose: () => void;
  onSave: (displayName: string | null) => void;
  visible: boolean;
}

/**
 * README p1-02 §7: "Tên hiển thị trong nhóm chỉnh ở thẻ của chính mình" — mở
 * duy nhất từ `MemberCardSheet` khi `card.isMe`. Chuỗi rỗng gửi lên thành
 * `null` (be.md §3 `patchMemberSchema`: `displayName` là `nullable` — xoá biệt
 * danh riêng để quay lại dùng tên tài khoản).
 */
export function EditDisplayNameSheet(props: EditDisplayNameSheetProps) {
  return <EditDisplayNameSheetContent key={props.visible ? 'open' : 'closed'} {...props} />;
}

function EditDisplayNameSheetContent({
  currentName,
  loading,
  onClose,
  onSave,
  visible,
}: EditDisplayNameSheetProps) {
  const [value, setValue] = useState(currentName ?? '');

  return (
    <BottomSheet
      footer={
        <Button fullWidth label="Lưu" loading={loading} onPress={() => onSave(value.trim() || null)} />
      }
      title="Đổi tên hiển thị trong nhóm"
      visible={visible}
      onClose={onClose}
    >
      <Input
        hint={`${value.length}/${DISPLAY_NAME_MAX}`}
        label="Tên hiển thị"
        maxLength={DISPLAY_NAME_MAX}
        placeholder="Để trống để dùng tên tài khoản"
        value={value}
        onChangeText={setValue}
      />
    </BottomSheet>
  );
}

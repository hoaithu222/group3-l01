import { useState } from 'react';

import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

import { firstNameError, nameSchema } from '../schemas/resource.schemas';

export interface NameSheetProps {
  /** Lỗi từ máy chủ (`RSC_002` trùng tên…) — hiện dưới ô, GIỮ nội dung người dùng đã gõ. */
  error?: string;
  initialValue: string;
  label: string;
  maxLength: number;
  onClose: () => void;
  onSubmit: (name: string) => void;
  pending: boolean;
  subject: 'tệp' | 'thư mục';
  submitLabel: string;
  title: string;
  visible: boolean;
}

/** Gợi ý theo loại đối tượng — ví dụ đúng loại (thư mục không có đuôi tệp) thay vì một câu chung chung. */
const NAME_PLACEHOLDER: Record<NameSheetProps['subject'], string> = {
  'thư mục': 'Ví dụ: Tài liệu tuần 1',
  tệp: 'Ví dụ: Báo cáo tuần 1',
};

/**
 * Tấm nhập MỘT tên — dùng chung cho tạo thư mục và đổi tên (thư mục/tệp).
 *
 * `key` theo `visible` để mỗi lần mở là một lượt state MỚI (giá trị khởi tạo,
 * không dính lỗi cũ) — cùng mẫu `EditDisplayNameSheet`. Lỗi kiểm dữ liệu chỉ
 * hiện SAU khi bấm gửi (không mắng từ ký tự đầu), còn lỗi máy chủ hiện ngay và
 * được xoá khi người dùng sửa lại.
 */
export function NameSheet(props: NameSheetProps) {
  return <NameSheetContent key={props.visible ? 'open' : 'closed'} {...props} />;
}

function NameSheetContent({
  error,
  initialValue,
  label,
  maxLength,
  onClose,
  onSubmit,
  pending,
  subject,
  submitLabel,
  title,
  visible,
}: NameSheetProps) {
  const [value, setValue] = useState(initialValue);
  const [submitted, setSubmitted] = useState(false);
  const [editedSinceError, setEditedSinceError] = useState(false);

  const validation = submitted ? firstNameError(nameSchema(maxLength, subject), value) : undefined;
  const message = validation ?? (editedSinceError ? undefined : error);

  const submit = () => {
    setSubmitted(true);
    setEditedSinceError(false);
    const trimmed = value.trim();
    if (firstNameError(nameSchema(maxLength, subject), value)) return;
    onSubmit(trimmed);
  };

  return (
    <BottomSheet
      footer={<Button fullWidth label={submitLabel} loading={pending} onPress={submit} />}
      title={title}
      visible={visible}
      onClose={onClose}
    >
      {/* ✅ Dòng dưới ô LUÔN có mặt (gợi ý giới hạn độ dài ↔ lỗi, cùng một chỗ): lỗi hiện ra không đẩy nút đáy nhảy lên. */}
      <Input
        autoFocus
        label={label}
        maxLength={maxLength}
        message={message ?? `Tối đa ${maxLength} ký tự`}
        messageTone={message ? 'error' : 'hint'}
        placeholder={NAME_PLACEHOLDER[subject]}
        returnKeyType="done"
        value={value}
        onChangeText={(next) => {
          setValue(next);
          setEditedSinceError(true);
        }}
        onSubmitEditing={submit}
      />
    </BottomSheet>
  );
}

import { useState } from 'react';

import { useConnectionState } from '@/core/socket';
import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

import type { ScheduledMessageView } from '../../api/chat-extensions.types';
import { describeChatExtError } from '../../utils/error-info';

export interface EditScheduledContentSheetProps {
  row: ScheduledMessageView | null;
  visible: boolean;
  pending: boolean;
  /** Lỗi từ BE của lượt lưu gần nhất (đã qua `describeChatExtError`). */
  error?: unknown;
  onClose: () => void;
  onSave: (content: string) => void;
}

/**
 * Sửa NỘI DUNG chữ của tin hẹn giờ còn đang chờ (chỉ tin KHÔNG có nhắc tên — xem `ScheduledMessageRow`). Tin không có chữ (chỉ tệp) thì nội dung mới bắt buộc không rỗng; tin có tệp
 * thì được để trống chữ. BE kiểm lại độ dài/tệp (`MSG_001/005/007`) — lỗi hiện trong tấm để sửa, không toast. State ô nhập reset nhờ `key` do màn đổi mỗi lần mở.
 */
export function EditScheduledContentSheet({
  row,
  visible,
  pending,
  error,
  onClose,
  onSave,
}: EditScheduledContentSheetProps) {
  const offline = useConnectionState() === 'offline';
  const [text, setText] = useState(row?.content ?? '');
  const trimmed = text.trim();
  const needsText = (row?.attachments.length ?? 0) === 0;
  const unchanged = trimmed === (row?.content ?? '').trim();
  const info = error === undefined ? undefined : describeChatExtError(error);

  return (
    <BottomSheet
      // Lỗi ghim dưới tiêu đề (khe `alert`); thân tấm chỉ còn ô nhập. ⛔ Không `pb-*` cuối thân: `footer` tự cách nội dung 12dp.
      alert={info ? <Alert description={info.message} tone="error" /> : undefined}
      dismissOnBackdrop={!pending}
      footer={
        <Button
          disabled={offline || unchanged || (needsText && trimmed.length === 0)}
          fullWidth
          label={offline ? 'Kết nối lại để lưu' : 'Lưu nội dung'}
          loading={pending}
          onPress={() => onSave(trimmed)}
        />
      }
      scrollable
      title="Sửa nội dung"
      visible={visible}
      onClose={onClose}
    >
      <Input
        label="Nội dung tin"
        multiline
        placeholder="Nhập nội dung tin"
        value={text}
        onChangeText={setText}
      />
    </BottomSheet>
  );
}

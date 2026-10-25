import { useState } from 'react';

import { Alert } from '@/shared/ui/alert';
import { Input } from '@/shared/ui/input';
import { Dialog } from '@/shared/ui/modal';

import { REVIEW_REASON_MAX, REVIEW_REASON_MIN } from '../../constants/review.constants';
import { isValidReviewReason } from '../../schemas/review.schemas';

export interface WaiveReviewDialogProps {
  /** Câu lỗi từ lần gửi trước (`REVIEW_007`, mạng…) — giữ nguyên lý do đang nhập. */
  error?: string | null;
  pending?: boolean;
  visible: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

/**
 * Miễn chấm (OWNER/ADMIN, p4-05 app.md §2 `WaiveReviewDialog`): thẻ sang Hoàn thành được mà không cần đủ lượt duyệt. BẮT BUỘC lý do ≥ 10
 * ký tự — ghi audit `task-review.waive` và thông báo người làm; lượt miễn KHÔNG có điểm review nên không tính vào điểm đóng góp.
 * Hộp thoại (không phải tấm trượt): đây là việc ngắn BẮT người dùng quyết định.
 */
export function WaiveReviewDialog({ error, pending = false, visible, onClose, onConfirm }: WaiveReviewDialogProps) {
  const [reason, setReason] = useState('');
  const valid = isValidReviewReason(reason);

  const close = () => {
    setReason('');
    onClose();
  };

  return (
    <Dialog
      description="Thẻ sẽ được coi là đã duyệt và kéo sang Hoàn thành được ngay. Hành động này được ghi nhật ký và báo cho người làm thẻ."
      primaryAction={{ disabled: !valid, label: 'Miễn chấm', loading: pending, onPress: () => onConfirm(reason.trim()) }}
      secondaryAction={{ label: 'Huỷ', onPress: close }}
      title="Miễn chấm thẻ này?"
      variant="warning"
      visible={visible}
      onClose={close}
    >
      {error ? <Alert description={error} tone="error" /> : null}
      <Input
        accessibilityLabel="Lý do miễn chấm"
        hint={`Tối thiểu ${REVIEW_REASON_MIN} ký tự`}
        maxLength={REVIEW_REASON_MAX}
        multiline
        placeholder="Vì sao thẻ này không cần chấm?"
        value={reason}
        onChangeText={setReason}
      />
    </Dialog>
  );
}

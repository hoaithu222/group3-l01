import { useEffect } from 'react';

import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import { useChatExtLimits } from '../../hooks/useChatSubFeatures';
import { useCreateReminder } from '../../hooks/useReminders';
import { describeChatExtError } from '../../utils/error-info';
import { daysToMs } from '../../utils/local-time';
import { WhenPickerSheet } from '../when/WhenPickerSheet';

export interface RemindMeSheetProps {
  /** `null` khi không có ý định mở — tấm giữ nội dung tĩnh trong lúc trượt xuống. */
  messageId: string | null;
  visible: boolean;
  onClose: () => void;
}

/**
 * Tấm "Nhắc lại" từ menu tin (p7-04 app.md §3 `RemindMeSheet`): "Sau 20 phút" · "Sau 1 giờ" · "Sáng mai 08:00" · "Thứ Hai tới 08:00" · "Chọn thời gian". Nhắc chỉ đến CHÍNH mình
 * (thông báo riêng), BE kiểm lại quyền đọc tin lúc đến hạn.
 *
 * `MSG_012` (tin không đọc được/đã gỡ) là kết luận cuối: đóng tấm + toast "Tin không còn khả dụng" (không để người dùng nhìn một lỗi không sửa được). `REMIND_001` dưới ô giờ;
 * `REMIND_002` (đủ trần lời nhắc) trong khối cảnh báo.
 */
export function RemindMeSheet({ messageId, visible, onClose }: RemindMeSheetProps) {
  const limits = useChatExtLimits().reminder;
  const create = useCreateReminder();
  const error = create.isError ? describeChatExtError(create.error) : undefined;
  const messageGone = error?.code === 'MSG_012';

  useEffect(() => {
    if (!messageGone) return;
    showToast('info', 'Tin không còn khả dụng');
    onClose();
  }, [messageGone, onClose]);

  return (
    <WhenPickerSheet
      description="Bạn sẽ nhận một thông báo riêng vào thời điểm đã chọn."
      kind="remind"
      otherError={error && !error.timeField && !messageGone ? error.message : undefined}
      pending={create.isPending}
      subject="Thời điểm nhắc"
      submitLabel="Nhắc tôi"
      summaryPrefix="Nhắc lúc"
      timeError={error?.timeField ? error.message : undefined}
      title="Nhắc lại tin này"
      visible={visible}
      window={{ minLeadMs: limits.minLeadSeconds * 1000, maxMs: daysToMs(limits.remindAtMaxDays) }}
      onClose={onClose}
      onSubmit={(at) => {
        // Rung "đã lưu" khi server nhận lời nhắc — tấm đóng ngay sau đó nên đây là phản hồi duy nhất của việc vừa xong.
        if (messageId) {
          create.mutate(
            { messageId, remindAt: at.toISOString() },
            {
              onSuccess: () => {
                hapticSuccess();
                onClose();
              },
            },
          );
        }
      }}
    />
  );
}

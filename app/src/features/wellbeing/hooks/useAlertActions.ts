import { showToast } from '@/shared/utils/toast.utils';

import { useAckAlert } from '../queries/wellbeing.mutations';
import { isGone, wellbeingErrorMessage } from '../utils/wellbeing-errors';

/**
 * "Đã hiểu" / "Nhắc lại sau" cho MỘT cảnh báo (dùng ở thẻ nổi lẫn thẻ trong màn Sức khoẻ). Thẻ biến mất NGAY (`useAckAlert` gỡ lạc quan); lỗi thì thẻ hiện lại kèm toast.
 * `mutateAsync` + `try/catch` chứ không `mutate(…, { onError })`: ngay khi gỡ lạc quan, thẻ (nơi bấm) có thể đã bị tháo khỏi cây, mà callback của `mutate`
 * CHỈ chạy khi component gọi còn mounted — toast lỗi sẽ bị nuốt và người dùng tưởng đã xong. Hook này đặt ở component cha (luôn còn), promise thì luôn được xử lý tiếp.
 * "Nhắc lại sau" = BE tạm hoãn cảnh báo 24 giờ, nên nói đúng như vậy thay vì hứa "nhắc lại" một thời điểm không có thật.
 */
export function useAlertActions(alertId: string | null) {
  const ack = useAckAlert();

  const run = async (action: 'DISMISS' | 'SNOOZE'): Promise<void> => {
    if (!alertId) return;
    try {
      await ack.mutateAsync({ action, id: alertId });
    } catch (error) {
      if (isGone(error)) return;
      showToast('error', wellbeingErrorMessage(error));
      return;
    }
    if (action === 'SNOOZE') showToast('info', 'Mình sẽ chưa nhắc bạn trong 24 giờ tới');
  };

  return {
    busy: ack.isPending,
    dismiss: () => void run('DISMISS'),
    snooze: () => void run('SNOOZE'),
  };
}

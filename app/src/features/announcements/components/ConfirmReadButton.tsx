import { useConnectionState } from '@/core/socket';
import { Button } from '@/shared/ui/button';
import { hapticTap } from '@/shared/utils/haptics';

import { useConfirmRead } from '../queries/announcement-actions.queries';

export interface ConfirmReadButtonProps {
  channelId: string;
  messageId: string;
}

/**
 * "Tôi đã đọc" (p5-04 app.md §3). Bấm là LẠC QUAN: huy hiệu → "Đã xác nhận" và nút biến mất ngay (`useConfirmRead`), lỗi
 * thì hoàn lại + toast (`ANN_003` ⇒ "Đã hết hạn"). `loading` chặn bấm đúp trong khoảng giữa lúc bấm và lúc cache đổi.
 * Mất mạng: nút KHOÁ và đổi nhãn — biên nhận chỉ tạo khi người đọc chủ động bấm, không xếp hàng chờ gửi sau (RC-02).
 */
export function ConfirmReadButton({ channelId, messageId }: ConfirmReadButtonProps) {
  const offline = useConnectionState() === 'offline';
  const { isPending, mutate } = useConfirmRead(channelId);

  return (
    <Button
      disabled={offline}
      // Dấu tick trước nhãn: nút đọc ra ngay là "xác nhận" (mất mạng thì đổi sang icon ngắt kết nối cùng nhãn lý do).
      iconLeft={offline ? 'unlink' : 'checkmark-circle'}
      label={offline ? 'Kết nối lại để xác nhận' : 'Tôi đã đọc'}
      loading={isPending}
      size="sm"
      // Rung nhẹ TRƯỚC `mutate` — phản hồi tức thì của cú chạm; huy hiệu đổi sang "Đã xác nhận" ngay sau đó (lạc quan).
      onPress={() => {
        hapticTap();
        mutate(messageId);
      }}
    />
  );
}

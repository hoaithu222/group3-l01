import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { hapticTap } from '@/shared/utils/haptics';

import { CallControl } from './CallControl';

export interface IncomingCallActionsProps {
  answering: boolean;
  onAnswer: () => void;
  onDecline: () => void;
}

/**
 * Hai nút của cuộc gọi ĐẾN: Từ chối (đỏ) và Trả lời (xanh) — TRÒN LỚN (`iconOnly size="lg"` = 56×56,
 * cùng cỡ nút Kết thúc của `ActiveCallControls`) thay vì hai viên thuốc chữ nhật đầy chữ: đây là hình
 * "nghe máy/gác máy" mà mọi app gọi điện dùng, người dùng nhận ra ngay không cần đọc nhãn. Nhãn chữ dời
 * xuống DƯỚI mỗi nút (`CallControl`, tái dùng từ thanh điều khiển trong cuộc gọi cho hai màn cùng một
 * kiểu) nên ý nghĩa vẫn không chỉ dựa vào màu — giữ đúng lý do của bản viên thuốc cũ.
 *
 * `answering` khoá cả hai (chống bấm đúp — `answeringDeviceLock`): bấm Trả lời hai lần không gửi hai
 * `answer`, bấm Từ chối khi đang trả lời cũng không.
 */
export function IncomingCallActions({ answering, onAnswer, onDecline }: IncomingCallActionsProps) {
  return (
    <View className="flex-row items-center justify-center gap-3xl px-lg pb-xl">
      <CallControl label="Từ chối">
        <Button
          accessibilityLabel="Từ chối cuộc gọi"
          disabled={answering}
          iconLeft="cancel"
          iconOnly
          size="lg"
          variant="danger"
          onPress={() => {
            hapticTap();
            onDecline();
          }}
        />
      </CallControl>
      <CallControl label="Trả lời">
        <Button
          accessibilityLabel="Trả lời cuộc gọi"
          iconLeft="phone"
          iconOnly
          loading={answering}
          size="lg"
          variant="success"
          // Rung TRƯỚC khi trả lời (kết nối media mất vài trăm ms) — phản hồi tức thì rằng cú chạm đã nhận, người dùng khỏi bấm lần hai.
          onPress={() => {
            hapticTap();
            onAnswer();
          }}
        />
      </CallControl>
    </View>
  );
}

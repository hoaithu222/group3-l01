import { useReducedMotion } from 'react-native-reanimated';

import { Button } from '@/shared/ui/button';

import { StatusPage } from './StatusPage';
import { WaitingPulse } from './WaitingPulse';

export interface LobbyWaitingViewProps {
  /** Đang gọi `DELETE lobby/me` — nút "Huỷ yêu cầu" khoá + vòng quay. */
  cancelling?: boolean;
  /** Ép bật/tắt hoạt ảnh; không truyền thì theo "Giảm chuyển động" của hệ điều hành (`useReducedMotion`). */
  reduceMotion?: boolean;
  /** Tên cuộc họp (chữ nhỏ trên tiêu đề). */
  title?: string;
  onCancel: () => void;
}

/**
 * Phòng chờ lobby (app.md p2-05 §3.2, `IN_LOBBY`): "Đang chờ chủ trì cho vào…" + hoạt ảnh nhẹ + "Huỷ yêu cầu". Yêu cầu vẫn được giữ ở
 * server (TTL) kể cả khi mất mạng, nên không có trạng thái lỗi riêng ở đây; DENIED chuyển sang `JoinBlockedView` do hook của cha lo.
 *
 * Reduce motion: biểu tượng đứng yên, thông điệp bằng chữ vẫn nguyên — trạng thái không phụ thuộc hoạt ảnh.
 */
export function LobbyWaitingView({ cancelling = false, reduceMotion, title, onCancel }: LobbyWaitingViewProps) {
  const systemReduce = useReducedMotion();

  return (
    <StatusPage
      actions={
        <Button fullWidth label="Huỷ yêu cầu" loading={cancelling} variant="secondary" onPress={onCancel} />
      }
      description="Chủ trì sẽ thấy yêu cầu của bạn và cho bạn vào. Bạn có thể đợi ở đây hoặc huỷ yêu cầu."
      eyebrow={title}
      headerTitle="Phòng chờ"
      icon="clock"
      iconSlot={<WaitingPulse still={reduceMotion ?? systemReduce} />}
      title="Đang chờ chủ trì cho vào…"
    />
  );
}

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { formatTime } from '@/shared/utils/format/date.utils';

import { formatCountdown } from '../../utils/countdown.utils';
import { StatusPage } from './StatusPage';

export interface WaitingForHostViewProps {
  /** Khung xem trước/đổi thiết bị vẫn dùng được trong lúc chờ (app.md §3.2) — cha truyền nếu muốn. */
  previewSlot?: ReactNode;
  /** Còn bao nhiêu ms tới giờ bắt đầu, TÍNH THEO GIỜ SERVER (`useMeetingClock`) — hai máy lệch đồng hồ vẫn đếm cùng nhịp. */
  remainingMs: number;
  startAt: string;
  title: string;
  onExit: () => void;
}

/**
 * Phòng chờ chủ trì (app.md p2-05 §3.2 `WaitingForHostView`, `WAITING_FOR_HOST`): "Chủ trì chưa bắt đầu cuộc họp" + giờ bắt đầu + đếm
 * ngược. Khi `meeting:started` tới, hook của cha gọi `join` lại — component chỉ VẼ, không tự vào phòng (luật: không tự bật mic/camera).
 *
 * Đếm ngược là `timer` (không phải live region): đọc từng giây sẽ làm trình đọc màn hình không ngừng nói. Về 0 mà chủ trì chưa bắt
 * đầu ⇒ "Sắp bắt đầu", KHÔNG hiện số âm.
 */
export function WaitingForHostView({ previewSlot, remainingMs, startAt, title, onExit }: WaitingForHostViewProps) {
  return (
    <StatusPage
      actions={<Button fullWidth label="Thoát" variant="secondary" onPress={onExit} />}
      description={`Cuộc họp bắt đầu lúc ${formatTime(startAt)}. Bạn sẽ được vào phòng khi chủ trì bắt đầu.`}
      eyebrow={title}
      headerTitle="Phòng chờ"
      icon="timer"
      title="Chủ trì chưa bắt đầu cuộc họp"
      tone="info"
      onBack={onExit}
    >
      <Text accessibilityRole="timer" className="text-header-md text-fg-brand">
        {formatCountdown(remainingMs)}
      </Text>
      {previewSlot ? <View className="w-full">{previewSlot}</View> : null}
    </StatusPage>
  );
}

import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { BottomActionBar } from '@/shared/ui/navigation';
import { hapticTap } from '@/shared/utils/haptics';
import { cn } from '@/shared/utils/style/cn';

import type { PomodoroJoinBlockedReason, PomodoroMyActions } from '../api/pomodoro.types';

export interface PomodoroPreviewBarProps {
  actions: PomodoroMyActions | undefined;
  /** Kênh CHƯA có phiên (snapshot ảo `version = 0`) — cho phép "Bắt đầu" thẳng từ preview. */
  noSession: boolean;
  offline: boolean;
  onJoin: () => void;
  onStartNow: () => void;
  pending: boolean;
  /** Lỗi vào phòng gần nhất (đã dịch) — hiện ngay trên nút. */
  failure: string | null;
}

const BLOCKED_TEXT: Record<PomodoroJoinBlockedReason, string> = {
  ARCHIVED: 'Kênh đã lưu trữ — chỉ xem, không vào phòng được.',
  FULL: 'Phòng đã đủ người.',
  REMOVED: 'Bạn đã được mời ra khỏi phiên này. Phiên mới bắt đầu thì vào được.',
};

/**
 * Thanh đáy của preview (app.md §3): "Vào học" (vào với mic TẮT mặc định — quyền mic chỉ xin khi bấm bật) và, khi kênh chưa có phiên, "Bắt đầu" (mở phòng
 * rồi chạy vòng tập trung đầu tiên). Nút hiện/khoá theo `myActions` của SERVER (client không tự suy quyền); ngoại tuyến ⇒ khoá và nói lý do. Kênh
 * lưu trữ thì không có nút nào (chỉ xem).
 */
export function PomodoroPreviewBar({
  actions,
  failure,
  noSession,
  offline,
  onJoin,
  onStartNow,
  pending,
}: PomodoroPreviewBarProps) {
  const reason = actions?.joinBlockedReason;
  const hint = offline
    ? 'Bạn đang ngoại tuyến — cần mạng để vào học.'
    : reason
      ? BLOCKED_TEXT[reason]
      : failure;
  const showStart = noSession && actions?.canStart === true;
  const canJoin = actions?.canJoin !== false;
  // Rung "chạm" khi vào học/bắt đầu — hành động chính của màn, còn phải chờ kết nối phòng nên phản hồi tức thì là cần.
  const withTap = (action: () => void) => () => {
    hapticTap();
    action();
  };

  return (
    <BottomActionBar>
      <View className="gap-xs">
        {hint ? (
          // Lớp gộp bằng `cn()` — ⛔ không nối chuỗi (NativeWind áp theo độ ưu tiên CSS, không theo thứ tự trong chuỗi).
          <Text
            accessibilityLiveRegion="polite"
            className={cn(
              'text-center text-caption-lg',
              failure && !offline && !reason ? 'text-error' : 'text-fg-2',
            )}
          >
            {hint}
          </Text>
        ) : null}
        {reason === 'ARCHIVED' ? null : showStart ? (
          <>
            <Button
              disabled={offline || !canJoin}
              fullWidth
              iconLeft="play"
              label="Bắt đầu"
              loading={pending}
              onPress={withTap(onStartNow)}
            />
            <Button
              disabled={offline || pending || !canJoin}
              fullWidth
              label="Vào phòng chờ"
              variant="tertiary"
              onPress={withTap(onJoin)}
            />
          </>
        ) : (
          <Button
            disabled={offline || !canJoin}
            fullWidth
            iconLeft="login"
            label="Vào học"
            loading={pending}
            onPress={withTap(onJoin)}
          />
        )}
      </View>
    </BottomActionBar>
  );
}

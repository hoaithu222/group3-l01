import { useEffect } from 'react';
import { Text, View } from 'react-native';

import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { Skeleton } from '@/shared/ui/skeleton';
import { hapticSuccess } from '@/shared/utils/haptics';

import type { PomodoroSessionResult, PomodoroSummary } from '../api/pomodoro.types';
import { formatSpan } from '../utils/clock';

export interface SessionSummarySheetProps {
  /** Tóm tắt của chính snapshot ENDED — dùng khi chưa tải được số liệu riêng của tôi. */
  fallback: PomodoroSummary | undefined;
  loading: boolean;
  onClose: () => void;
  result: PomodoroSessionResult | undefined;
  visible: boolean;
}

/**
 * Ô số liệu: ô icon có tông (trang trí) + con số đậm + nhãn — cùng khuôn "thẻ thống kê" của cả app. Nền `bg-bg-1` + viền mảnh
 * (không `surface-*`): ô icon đã mang tông, nền cùng tông thì ô icon chìm mất. MỘT ô trợ năng ("Vòng hoàn thành: 3").
 */
function Stat({
  icon,
  label,
  tone,
  value,
}: {
  icon: IconName;
  label: string;
  tone: IconTileTone;
  value: string;
}) {
  return (
    <View
      accessibilityLabel={`${label}: ${value}`}
      accessible
      className="flex-1 items-center gap-2xs rounded-md border-hairline border-border-1 bg-bg-1 p-sm"
    >
      <IconTile name={icon} size="sm" tone={tone} />
      <Text className="text-header-sm font-bold text-fg-1">{value}</Text>
      <Text className="text-center text-caption-sm text-fg-2">{label}</Text>
    </View>
  );
}

/**
 * Kết quả phiên (app.md p5-02 §3): vòng hoàn thành của phiên, thời gian CÓ MẶT của tôi, số lần gián đoạn + chú thích "Nhật ký cá nhân, không dùng để
 * chấm điểm". Mở khi phiên vừa kết thúc lúc tôi đang trong phòng; số riêng của tôi tới từ `GET .../sessions/:id/summary` (chưa tải được thì vẫn hiện phần chung).
 */
export function SessionSummarySheet({
  fallback,
  loading,
  onClose,
  result,
  visible,
}: SessionSummarySheetProps) {
  const session = result?.session ?? fallback;
  const mine = result?.mine ?? null;
  // Rung "xong" MỘT lần khi tấm kết quả hiện ra — phiên học vừa hoàn thành là khoảnh khắc đáng có phản hồi (không setState ở đây).
  useEffect(() => {
    if (visible) hapticSuccess();
  }, [visible]);
  return (
    <BottomSheet
      description="Phiên Pomodoro đã kết thúc."
      footer={<Button fullWidth label="Xong" onPress={onClose} />}
      scrollable
      title="Kết quả phiên"
      visible={visible}
      onClose={onClose}
    >
      {loading && !session ? (
        <Skeleton className="h-24 rounded-md" />
      ) : (
        <View className="gap-md py-xs">
          <View className="flex-row gap-xs">
            <Stat
              icon="checkmark-circle"
              label="Vòng hoàn thành"
              tone="success"
              value={String(session?.completedFocusCycles ?? 0)}
            />
            <Stat
              icon="arrow-right"
              label="Vòng bỏ qua"
              tone="neutral"
              value={String(session?.skippedFocusCycles ?? 0)}
            />
          </View>
          {mine ? (
            <View className="gap-xs">
              <View className="flex-row gap-xs">
                <Stat
                  icon="timer"
                  label="Thời gian có mặt"
                  tone="brand"
                  value={formatSpan(mine.presentSeconds)}
                />
                <Stat
                  icon="alert-warning"
                  label="Lần gián đoạn"
                  tone="warning"
                  value={String(mine.interruptions)}
                />
              </View>
              <Text className="text-body-md text-fg-2">{`Bạn tham gia ${mine.cyclesAttended} vòng tập trung.`}</Text>
              {mine.goal ? (
                <Text className="text-body-md text-fg-1">{`Mục tiêu của bạn: ${mine.goal}`}</Text>
              ) : null}
            </View>
          ) : loading ? (
            <Skeleton className="h-16 rounded-md" />
          ) : (
            <Text className="text-body-md text-fg-2">Chưa tải được số liệu của riêng bạn.</Text>
          )}
          <Text className="text-caption-lg text-fg-2">
            Nhật ký cá nhân, không dùng để chấm điểm.
          </Text>
        </View>
      )}
    </BottomSheet>
  );
}

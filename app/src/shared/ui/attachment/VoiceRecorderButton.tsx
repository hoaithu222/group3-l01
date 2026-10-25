import { useState } from 'react';
import { PanResponder, Text, View } from 'react-native';
import type { GestureResponderEvent, PanResponderGestureState } from 'react-native';

import { openAppSettings } from '@/core/media/permissions';
import { useVoiceRecorder, type VoiceRecordResult } from '@/core/media/use-voice-recorder';
import { Icon } from '@/shared/ui/icon';
import { showToast } from '@/shared/utils/toast.utils';
import { cn } from '@/shared/utils/style/cn';

import { Dialog } from '../modal/Dialog';

/** Vuốt trái quá ngưỡng này (dp) trước khi thả ⇒ huỷ, không upload — app.md §3. */
const SWIPE_CANCEL_THRESHOLD = -80;

/**
 * Cỡ nút: `lg` 56dp (`h-control-lg`, mặc định — nút ghi âm đứng riêng) · `sm` 40dp (`h-control-sm`, cùng cỡ
 * nút `Button size="sm" iconOnly` — dùng khi nút nằm CÙNG HÀNG với các nút 40dp khác, vd hàng ô soạn tin).
 *
 * ⚠️ `w-*` KHÔNG có token `control-*` (`tailwind.config.js` chỉ nối `layout.height`) — `w-14` = 56dp, `w-10` = 40dp.
 * Cỡ đi qua prop này (không phải `className`) để chiều cao, bề rộng và vùng chạm luôn đổi CÙNG nhau.
 */
const SIZE_CLASS = {
  sm: 'h-control-sm w-10',
  lg: 'h-control-lg w-14',
} as const;

export interface VoiceRecorderButtonProps {
  className?: string;
  onCancel?: () => void;
  onRecorded: (result: VoiceRecordResult) => void;
  size?: keyof typeof SIZE_CLASS;
}

function formatClock(totalSeconds: number): string {
  const mm = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const ss = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * Nút ghi voice note — GIỮ để bắt đầu ghi, VUỐT TRÁI để huỷ, THẢ để hoàn tất
 * (app.md §3). Quyền micro xin NGAY LÚC GIỮ, không xin trước (app.md §7).
 *
 * ⚠️ Dùng `PanResponder` (RN thuần) thay vì `react-native-gesture-handler` +
 * Reanimated: tránh hẳn cái bẫy `Animated.View` + `className` triệt tiêu style
 * của nhau (`shared/ui/AGENTS.md` mục "Chuyển động") trong khi hạ tầng này CHƯA
 * có màn thật nào dùng để tinh chỉnh hoạt ảnh — phản hồi bằng ĐỔI MÀU + CHỮ là
 * đủ cho lượt dựng hạ tầng, xem app.md "Phase 1 dùng lại".
 *
 * ⚠️ `PanResponder.create(...)` dựng LẠI mỗi lần render, CỐ Ý không
 * `useRef`/`useMemo` giữ một bản duy nhất: handler của nó cần đọc
 * `recorder`/`dx` MỚI NHẤT tại đúng thời điểm cử chỉ xảy ra, và
 * `react-hooks/refs` (React Compiler) chặn mọi ref bị "đóng gói" vào một hàm
 * rồi đem gán cho API khác (`PanResponder.create`) — kể cả khi hàm đó chỉ chạy
 * lúc có cử chỉ thật, không phải lúc render. `PanResponder.create` chỉ tạo một
 * object thuần, không có chi phí native, nên dựng lại mỗi render vô hại.
 */
export function VoiceRecorderButton({
  className,
  onCancel,
  onRecorded,
  size = 'lg',
}: VoiceRecorderButtonProps) {
  const recorder = useVoiceRecorder();
  const [swiping, setSwiping] = useState(false);
  const [dx, setDx] = useState(0);
  const [permissionBlocked, setPermissionBlocked] = useState(false);

  const finish = async (cancelled: boolean): Promise<void> => {
    if (cancelled) {
      await recorder.cancel();
      onCancel?.();
      return;
    }
    const result = await recorder.stop();
    if (result) onRecorded(result);
    else onCancel?.(); // < 1s — coi như bấm nhầm, app.md §7.
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      setDx(0);
      setSwiping(false);
      void (async () => {
        const outcome = await recorder.start();
        if (outcome === 'permission-blocked') setPermissionBlocked(true);
        else if (outcome === 'failed') showToast('error', 'Không bật được micro. Hãy thử lại.');
      })();
    },
    onPanResponderMove: (_event: GestureResponderEvent, gesture: PanResponderGestureState) => {
      setDx(gesture.dx);
      setSwiping(gesture.dx < SWIPE_CANCEL_THRESHOLD);
    },
    onPanResponderRelease: () => void finish(dx < SWIPE_CANCEL_THRESHOLD),
    onPanResponderTerminate: () => void finish(true),
  });

  return (
    // `items-end`: nút nằm sát mép phải hàng ô soạn tin; nhãn đồng hồ nằm TRÊN nút (không phải dưới) để lúc ghi âm
    // nút vẫn neo đáy hàng, cùng trục với các nút khác — hàng cao lên về phía trên chứ không kéo nút lệch.
    <View className="items-end gap-2xs">
      {recorder.isRecording && (
        <Text className="text-label-sm text-fg-2">
          {swiping ? 'Thả để huỷ' : `${formatClock(recorder.seconds)} · Vuốt trái để huỷ`}
        </Text>
      )}

      <View
        accessibilityHint="Giữ để ghi âm, vuốt trái để huỷ"
        accessibilityLabel={
          recorder.isRecording
            ? `Đang ghi âm ${formatClock(recorder.seconds)}`
            : 'Ghi âm tin nhắn thoại'
        }
        accessibilityRole="button"
        className={cn(
          // ⚠️ Chỉ `height` được nối token `control-*` trong `tailwind.config.js`
          // (`layout.height`) — KHÔNG có `width`: xem `SIZE_CLASS` ở đầu file.
          'items-center justify-center rounded-full',
          SIZE_CLASS[size],
          // Đứng yên là nền tint nhạt + icon thương hiệu (như nút Gửi chưa kích hoạt) chứ KHÔNG phải đĩa đen `action-ink`: đĩa đen là mảng
          // nặng nhất của cả thanh soạn tin, giành mắt với chính ô nhập. Chỉ khi đang ghi mới chuyển sang màu đặc để báo trạng thái.
          recorder.isRecording
            ? swiping
              ? 'bg-action-error'
              : 'bg-action-base'
            : 'bg-action-tint',
          className,
        )}
        // `sm` 40dp < 44dp — nới 2dp mỗi cạnh cho đủ vùng chạm (cùng số với `Button size="sm" iconOnly`).
        hitSlop={size === 'sm' ? 2 : undefined}
        {...panResponder.panHandlers}
      >
        <Icon
          color={recorder.isRecording ? 'fg-inverse' : 'fg-brand'}
          name={swiping ? 'delete' : 'mic-01'}
          size={24}
        />
      </View>

      <Dialog
        description="Vào Cài đặt để cấp quyền micro cho ứng dụng."
        primaryAction={{
          label: 'Mở Cài đặt',
          onPress: () => {
            setPermissionBlocked(false);
            openAppSettings();
          },
        }}
        secondaryAction={{ label: 'Để sau', onPress: () => setPermissionBlocked(false) }}
        title="Chưa có quyền micro"
        variant="warning"
        visible={permissionBlocked}
        onClose={() => setPermissionBlocked(false)}
      />
    </View>
  );
}

import { useState } from 'react';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { hapticSuccess } from '@/shared/utils/haptics';
import { serverNowMs } from '@/shell/store/slices/clock/clock.store';

import { useRequestConfirm } from '../queries/announcement-actions.queries';
import { describeAnnouncementError } from '../utils/error-info';
import {
  DEADLINE_PRESETS,
  DEFAULT_DEADLINE_PRESET_KEY,
  deadlineFromPreset,
  findDeadlinePreset,
} from '../utils/deadline-presets';

export interface RequestConfirmSheetProps {
  channelId: string;
  /** `null` khi không có ý định mở — tấm giữ nguyên nội dung tĩnh trong lúc trượt xuống. */
  messageId: string | null;
  onClose: () => void;
  visible: boolean;
}

/**
 * Tấm "Yêu cầu xác nhận đã đọc" (p5-04 app.md §3): chọn hạn (tuỳ chọn) rồi gửi. Hạn tính theo giờ MÁY CHỦ và BE kiểm lại
 * ("tương lai, ≤ 30 ngày"). Thành công ⇒ đóng tấm (toast + huy hiệu do mutation lo); lỗi ⇒ tấm ở lại để chọn lại/thử lại.
 * Trạng thái chọn hạn reset mỗi lần mở nhờ `key` (`session`) ở `AnnouncementHost`.
 */
export function RequestConfirmSheet({
  channelId,
  messageId,
  onClose,
  visible,
}: RequestConfirmSheetProps) {
  const [presetKey, setPresetKey] = useState(DEFAULT_DEADLINE_PRESET_KEY);
  const offline = useConnectionState() === 'offline';
  const { error, isPending, mutate } = useRequestConfirm(channelId);

  function submit() {
    if (!messageId) return;
    const deadlineAt = deadlineFromPreset(findDeadlinePreset(presetKey), serverNowMs());
    // Rung "đã xong" cùng lúc tấm đóng — yêu cầu đã được gửi tới cả kênh.
    mutate(
      { deadlineAt, messageId },
      {
        onSuccess: () => {
          hapticSuccess();
          onClose();
        },
      },
    );
  }

  return (
    <BottomSheet
      // ⚠️ Toast lỗi của mutation vẽ ở gốc app — NẰM DƯỚI cửa sổ `Modal` của tấm, tấm còn mở thì không ai thấy. ✅ Lỗi nhắc lại ở
      // khe `alert` (ghim dưới mô tả) để người dùng biết vì sao chưa gửi được mà chọn lại hạn/thử lại.
      alert={
        error ? (
          <Alert description={describeAnnouncementError(error).message} tone="error" />
        ) : undefined
      }
      description='Mọi người trong kênh sẽ nhận thông báo và cần bấm "Tôi đã đọc".'
      dismissOnBackdrop={!isPending}
      footer={
        <Button
          disabled={offline}
          fullWidth
          label={offline ? 'Kết nối lại để gửi' : 'Gửi yêu cầu'}
          loading={isPending}
          onPress={submit}
        />
      }
      title="Yêu cầu xác nhận đã đọc"
      visible={visible}
      onClose={onClose}
    >
      <View
        accessibilityLabel="Hạn xác nhận"
        accessibilityRole="radiogroup"
        className="flex-row flex-wrap gap-xs"
      >
        {DEADLINE_PRESETS.map((preset) => (
          <Chip
            key={preset.key}
            label={preset.label}
            role="radio"
            selected={preset.key === presetKey}
            onPress={() => setPresetKey(preset.key)}
          />
        ))}
      </View>
    </BottomSheet>
  );
}

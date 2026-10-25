import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Stepper } from '@/shared/ui/stepper';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import { PREFERRED_BREAK_DEFAULT, PREFERRED_BREAK_LIMITS } from '../constants/wellbeing.constants';
import { useSetPreferredBreak } from '../queries/wellbeing.mutations';
import { isNotEnabled, wellbeingErrorMessage } from '../utils/wellbeing-errors';
import type { PreferredBreak } from '../api/wellbeing.types';

export interface PreferredBreakCardProps {
  disabled?: boolean;
  value: PreferredBreak | null;
}

/**
 * Giờ làm/nghỉ mong muốn (P1, app.md §3 "Cài đặt"): hai ô tăng/giảm (phút làm liên tục · phút nghỉ) + nút Lưu — không tự lưu mỗi lần
 * chạm để tránh gửi hàng chục lượt PATCH khi người dùng đang dò số. BE lưu sẵn cho nút nghỉ trong Pomodoro (P1 khác) đọc lại.
 */
export function PreferredBreakCard({ disabled = false, value }: PreferredBreakCardProps) {
  const setPreferredBreak = useSetPreferredBreak();
  const [workMinutes, setWorkMinutes] = useState(
    value?.workMinutes ?? PREFERRED_BREAK_DEFAULT.workMinutes,
  );
  const [breakMinutes, setBreakMinutes] = useState(
    value?.breakMinutes ?? PREFERRED_BREAK_DEFAULT.breakMinutes,
  );

  const changed =
    workMinutes !== (value?.workMinutes ?? PREFERRED_BREAK_DEFAULT.workMinutes) ||
    breakMinutes !== (value?.breakMinutes ?? PREFERRED_BREAK_DEFAULT.breakMinutes);

  const save = async (): Promise<void> => {
    try {
      await setPreferredBreak.mutateAsync({ workMinutes, breakMinutes });
      hapticSuccess();
      showToast('success', 'Đã lưu giờ làm/nghỉ mong muốn');
    } catch (error) {
      if (isNotEnabled(error)) {
        showToast('info', 'Theo dõi đã được tắt ở thiết bị khác');
        return;
      }
      showToast('error', wellbeingErrorMessage(error));
    }
  };

  return (
    <View className="gap-md">
      <Text className="text-body-md text-fg-2">
        Dùng cho nút nghỉ và gợi ý nhịp làm việc — không ảnh hưởng đánh giá sức khoẻ.
      </Text>
      <View className="flex-row items-center justify-between gap-sm">
        <Text className="flex-1 text-label-md text-fg-1">Làm liên tục (phút)</Text>
        <Stepper
          accessibilityLabel="Số phút làm liên tục"
          disabled={disabled || setPreferredBreak.isPending}
          max={PREFERRED_BREAK_LIMITS.workMinutesMax}
          min={PREFERRED_BREAK_LIMITS.workMinutesMin}
          step={5}
          value={workMinutes}
          onChange={setWorkMinutes}
        />
      </View>
      <View className="flex-row items-center justify-between gap-sm">
        <Text className="flex-1 text-label-md text-fg-1">Nghỉ (phút)</Text>
        <Stepper
          accessibilityLabel="Số phút nghỉ"
          disabled={disabled || setPreferredBreak.isPending}
          max={PREFERRED_BREAK_LIMITS.breakMinutesMax}
          min={PREFERRED_BREAK_LIMITS.breakMinutesMin}
          value={breakMinutes}
          onChange={setBreakMinutes}
        />
      </View>
      {changed ? (
        <Button
          disabled={disabled}
          label="Lưu giờ làm/nghỉ"
          loading={setPreferredBreak.isPending}
          variant="secondary"
          onPress={() => void save()}
        />
      ) : null}
    </View>
  );
}

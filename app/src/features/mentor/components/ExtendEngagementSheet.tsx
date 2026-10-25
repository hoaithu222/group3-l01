import { useState } from 'react';
import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { Icon } from '@/shared/ui/icon';
import { ProgressRing } from '@/shared/ui/progress-ring';
import { hapticSelection } from '@/shared/utils/haptics';

import type { MentorEngagement } from '../api/mentor.types';
import { EXTEND_CHOICES, MENTOR_LIMITS } from '../constants/mentor.constants';

export interface ExtendEngagementSheetProps {
  busy?: boolean;
  engagement: MentorEngagement | null;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (engagement: MentorEngagement, addDays: number) => void;
}

/** Gia hạn đợt cố vấn (tổng ≤ 90 ngày — mức vượt bị khoá sẵn, BE vẫn chặn `MENTOR_007`). */
export function ExtendEngagementSheet({
  busy,
  engagement,
  errorMessage,
  onClose,
  onSubmit,
}: ExtendEngagementSheetProps) {
  const [addDays, setAddDays] = useState<number>(EXTEND_CHOICES[0]);
  const used = engagement?.totalDays ?? 0;
  const remaining = engagement ? Math.max(0, MENTOR_LIMITS.totalDaysMax - engagement.totalDays) : 0;

  return (
    <BottomSheet
      // Lỗi server (`MENTOR_007`…) đứng yên dưới tiêu đề — cùng chỗ với mọi tấm có form, không chen giữa hàng chip và hàng nút.
      alert={errorMessage ? <Alert description={errorMessage} tone="error" /> : undefined}
      footer={
        <Button
          disabled={!engagement || addDays > remaining}
          fullWidth
          iconLeft="calendar"
          label="Gia hạn"
          loading={busy}
          onPress={() => engagement && onSubmit(engagement, addDays)}
        />
      }
      title="Gia hạn cố vấn"
      visible={engagement !== null}
      onClose={onClose}
    >
      <View className="gap-md py-xs">
        {/* Vòng tiến độ "đã dùng / 90 ngày" cạnh câu giải thích: liếc là thấy còn nhiều hay ít chỗ để gia hạn. */}
        <View className="flex-row items-center gap-sm">
          <ProgressRing
            label={`Đã dùng ${String(used)} trên ${String(MENTOR_LIMITS.totalDaysMax)} ngày cố vấn`}
            progress={used / MENTOR_LIMITS.totalDaysMax}
            size={48}
          >
            <Icon color="fg-2" name="calendar" size={20} />
          </ProgressRing>
          <Text className="flex-1 text-body-md text-fg-2">
            Đã dùng {used}/{MENTOR_LIMITS.totalDaysMax} ngày — còn gia hạn được tối đa {remaining}{' '}
            ngày.
          </Text>
        </View>
        {/* Chip vai `radio` cần nhóm `radiogroup` có tên — thiếu thì trình đọc màn hình đọc "+7 ngày, nút chọn" mà không biết chọn gì. */}
        <View
          accessibilityLabel="Số ngày gia hạn thêm"
          accessibilityRole="radiogroup"
          className="flex-row flex-wrap gap-xs"
        >
          {EXTEND_CHOICES.map((d) => (
            <Chip
              key={d}
              disabled={d > remaining}
              label={`+${d} ngày`}
              role="radio"
              selected={addDays === d}
              size="sm"
              onPress={() => {
                if (addDays !== d) hapticSelection();
                setAddDays(d);
              }}
            />
          ))}
        </View>
      </View>
    </BottomSheet>
  );
}

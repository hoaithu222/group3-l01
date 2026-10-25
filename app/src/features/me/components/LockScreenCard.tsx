import { View } from 'react-native';

import type { LockScreenLevel } from '@/core/notifications';
import { Alert } from '@/shared/ui/alert';
import { Section } from '@/shared/ui/section';
import { hapticSelection } from '@/shared/utils/haptics';

import { LOCK_SCREEN_OPTIONS, LOCK_SCREEN_RISK_NOTE } from '../constants/notification.messages';
import { ChoiceCard } from './ChoiceCard';

export interface LockScreenCardProps {
  disabled: boolean;
  onChange: (level: LockScreenLevel) => void;
  value: LockScreenLevel;
}

/**
 * "Màn hình khoá" (`lockScreenPreview` HIDDEN | SENDER | FULL): ba THẺ CHỌN có icon + một câu nói rõ người khác thấy gì,
 * thay cho `RadioGroup` trơn. Lời cảnh báo rủi ro là `Alert` nhẹ (tông `warning` luôn kèm icon vì màu cam không đạt
 * ngưỡng tương phản một mình) đứng NGAY dưới các lựa chọn nó giải thích.
 *
 * Bấm lại mức đang chọn không gọi `onChange` (giống `Radio`): tránh một lượt PUT thừa.
 */
export function LockScreenCard({ disabled, onChange, value }: LockScreenCardProps) {
  return (
    <Section icon="lock" title="Màn hình khoá">
      <View className="gap-sm">
        <View
          accessibilityLabel="Nội dung thông báo trên màn hình khoá"
          accessibilityRole="radiogroup"
          className="gap-xs"
        >
          {LOCK_SCREEN_OPTIONS.map((option) => (
            <ChoiceCard
              key={option.value}
              description={option.description}
              disabled={disabled}
              icon={option.icon}
              selected={value === option.value}
              title={option.label}
              onPress={() => {
                if (value === option.value) return;
                hapticSelection();
                onChange(option.value);
              }}
            />
          ))}
        </View>
        <Alert description={LOCK_SCREEN_RISK_NOTE} tone="warning" />
      </View>
    </Section>
  );
}

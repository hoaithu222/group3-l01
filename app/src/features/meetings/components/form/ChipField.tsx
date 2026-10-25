import { Text, View } from 'react-native';

import { Chip } from '@/shared/ui/chip';
import { Icon, type IconName } from '@/shared/ui/icon';
import { hapticSelection } from '@/shared/utils/haptics';

export interface ChipFieldProps<T extends string> {
  /** Icon đứng trước nhãn từng lựa chọn (tuỳ chọn) — chỉ cho nhóm mà icon nói được nghĩa (hình thức, kênh nhắc). */
  icons?: Partial<Record<T, IconName>>;
  label: string;
  labels: Record<T, string>;
  /** Khoá cả nhóm (LIVE không đổi được trường này). */
  locked?: boolean;
  /** Dòng lỗi dưới nhóm chip (lỗi trường của form). */
  message?: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Chọn MỘT trong vài giá trị bằng chip (`radiogroup`) — nền tảng, hình thức, hiển thị, phòng chờ, kênh nhắc. Đổi lựa chọn thì rung
 * nhịp "chọn" (`hapticSelection`); bấm lại đúng chip đang chọn thì không (không có gì thay đổi để báo).
 */
export function ChipField<T extends string>({
  icons,
  label,
  labels,
  locked,
  message,
  onChange,
  options,
  value,
}: ChipFieldProps<T>) {
  const pick = (option: T) => {
    if (option !== value) hapticSelection();
    onChange(option);
  };

  return (
    <View className="gap-2xs">
      <Text className="text-label-md text-fg-1">{label}</Text>
      <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-xs">
        {options.map((option) => {
          const icon = icons?.[option];
          return (
            <Chip
              key={option}
              disabled={locked}
              label={labels[option]}
              leading={
                icon ? (
                  <Icon color={value === option ? 'fg-brand' : 'fg-2'} name={icon} size="sm" />
                ) : undefined
              }
              role="radio"
              selected={value === option}
              onPress={() => pick(option)}
            />
          );
        })}
      </View>
      {message ? <Text className="text-caption-sm text-error">{message}</Text> : null}
    </View>
  );
}

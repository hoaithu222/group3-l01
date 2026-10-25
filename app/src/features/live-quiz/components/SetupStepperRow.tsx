import { Text, View } from 'react-native';

import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { Stepper } from '@/shared/ui/stepper';

interface SetupStepperRowProps {
  /** Nhãn cho trình đọc màn hình của ô tăng/giảm (cũng là tên hàng). */
  accessibilityLabel: string;
  hint: string;
  icon: IconName;
  max: number;
  min: number;
  title: string;
  tone: IconTileTone;
  value: number;
  step?: number;
  onChange: (value: number) => void;
}

/**
 * Một hàng thiết lập dạng số: ô icon tông + tên + gợi ý giới hạn + ô tăng/giảm. `flex-wrap` + bề rộng tối thiểu cho khối chữ để máy
 * hẹp (320dp) tự đẩy ô tăng/giảm (rộng 126dp) xuống dòng dưới thay vì bóp tên còn hai chữ; máy rộng thì cùng một hàng.
 * ⚠️ Hàng đứng trong `Card padded={false}` nên tự có lề `px-md`.
 */
export function SetupStepperRow({
  accessibilityLabel,
  hint,
  icon,
  max,
  min,
  onChange,
  step,
  title,
  tone,
  value,
}: SetupStepperRowProps) {
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-sm px-md py-sm">
      <View className="min-w-36 flex-1 flex-row items-center gap-sm">
        <IconTile name={icon} size="md" tone={tone} />
        <View className="flex-1">
          <Text className="text-label-lg text-fg-1">{title}</Text>
          <Text className="text-caption-lg text-fg-2">{hint}</Text>
        </View>
      </View>
      <Stepper
        accessibilityLabel={accessibilityLabel}
        max={max}
        min={min}
        step={step}
        value={value}
        onChange={onChange}
      />
    </View>
  );
}

import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

/** Số cột của thanh mức — đủ mịn để thấy nhịp nói, đủ thưa để vẫn đọc ra ở máy hẹp 320dp. */
const BAR_COUNT = 16;

export interface MicLevelMeterProps {
  /** Mức âm thanh 0..100 do cha đo (mic thử). Ngoài khoảng/`NaN` được kẹp về 0..100. */
  level: number;
  /** Mic đang bật. Tắt ⇒ mọi cột tắt và nhãn chữ là "Mic đang tắt" (dù `level` còn giá trị cũ). */
  micOn: boolean;
}

/**
 * Thanh mức micro ở pre-join (app.md p2-05 §3.2 `MicLevelMeter`). Trạng thái luôn có CHỮ ("Mic đang tắt" / "Đang nghe") — thanh màu chỉ
 * là phần phụ; cả khối là MỘT ô `progressbar` với `accessibilityValue` để trình đọc màn hình nói được mức.
 *
 * Dựng cục bộ vì bộ chung KHÔNG có thanh mức âm thanh (`Progress` là dòng thời gian dọc theo bước, không phải đồng hồ đo) và chỉ pre-join dùng
 * nó; nếu chỗ thứ hai cần thì đưa lên `@/shared/ui`. Các cột là hình trang trí có chiều cao cố định (`h-4`) và KHÔNG chứa chữ, nên không dính luật "khối chữ không được cao cứng".
 */
export function MicLevelMeter({ level, micOn }: MicLevelMeterProps) {
  const clamped = Number.isFinite(level) ? Math.min(100, Math.max(0, level)) : 0;
  const now = micOn ? Math.round(clamped) : 0;
  const active = Math.round((now / 100) * BAR_COUNT);
  const label = micOn ? 'Đang nghe' : 'Mic đang tắt';

  return (
    <View
      accessibilityLabel={`Mức âm thanh micro: ${label}`}
      accessibilityRole="progressbar"
      accessibilityValue={{ max: 100, min: 0, now, text: label }}
      accessible
      className="flex-row items-center gap-sm"
    >
      <Icon color={micOn ? 'success' : 'fg-2'} name="mic-01" size="sm" />
      <View className="h-4 flex-1 flex-row items-center gap-3xs">
        {Array.from({ length: BAR_COUNT }, (_, index) => (
          <View
            key={index}
            className={cn('h-full flex-1 rounded-full', index < active ? 'bg-action-success' : 'bg-bg-4')}
          />
        ))}
      </View>
      <Text className="text-label-md text-fg-2">{label}</Text>
    </View>
  );
}

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { AnimatedNumber } from '@/shared/ui/motion';

export interface HomeStatCardProps {
  /** Câu đầy đủ cho phần đầu thẻ (nhãn + số + chú thích) — đọc MỘT lượt thay vì từng mảnh. */
  accessibilityLabel: string;
  /** MỘT dòng chú thích dưới con số. */
  caption?: ReactNode;
  /** Phần thêm dưới đầu thẻ (thanh mảnh, biểu đồ 7 ngày, lời nhắc) — giữ ô trợ năng RIÊNG của chúng. */
  children?: ReactNode;
  format?: (value: number) => string;
  icon: IconName;
  label: string;
  tone: IconTileTone;
  /** Chữ nhỏ ngay sau con số ("ngày liên tiếp"). */
  unit?: string;
  /** Số ⇒ đếm lên (`AnimatedNumber`); chuỗi ⇒ trạng thái bằng chữ ("Chưa có chuỗi") — không bịa số 0. */
  value: number | string;
}

/**
 * Khuôn CHUNG của thẻ thống kê Trang chủ (chuỗi, hoạt động 7 ngày, cấp độ): nhãn `label-md` + `IconTile sm` góc phải,
 * con số `header-md` đậm đếm lên, một dòng chú thích, rồi phần thêm. Cùng đệm/bo góc/chiều cao tối thiểu với thẻ xu, giờ
 * tập trung, ôn tập (các feature đó dựng lại đúng khuôn này — ⛔ không import chéo feature).
 *
 * ⛔ Không vòng lặp trang trí nào ở đây: Trang chủ đã có MỘT vòng lặp nổi bật (quầng nền lời chào). Điểm nhấn là màu
 * tông của `IconTile` — tĩnh.
 */
export function HomeStatCard({
  accessibilityLabel,
  caption,
  children,
  format,
  icon,
  label,
  tone,
  unit,
  value,
}: HomeStatCardProps) {
  return (
    <Card className="min-h-32 gap-md">
      <View accessibilityLabel={accessibilityLabel} accessible className="gap-2xs">
        <View className="flex-row items-center gap-sm">
          <Text className="flex-1 text-label-md text-fg-2">{label}</Text>
          <IconTile name={icon} size="sm" tone={tone} />
        </View>
        <View className="flex-row items-baseline gap-2xs">
          {typeof value === 'number' ? (
            <AnimatedNumber
              className="text-header-md font-bold text-fg-1"
              format={format}
              value={value}
            />
          ) : (
            <Text className="text-header-md font-bold text-fg-1">{value}</Text>
          )}
          {unit ? <Text className="flex-1 text-body-md text-fg-2">{unit}</Text> : null}
        </View>
        {caption ? <Text className="text-caption-lg text-fg-2">{caption}</Text> : null}
      </View>
      {children}
    </Card>
  );
}

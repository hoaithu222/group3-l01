import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';

import type { WellbeingAssessment } from '../api/wellbeing.types';
import { LEVEL_COPY } from '../constants/wellbeing-copy.constants';
import { WELLBEING_MIN_DAYS } from '../constants/wellbeing.constants';
import { formatDayMonth } from '../utils/wellbeing-format';

export interface RiskLevelCardProps {
  /** Đánh giá mới nhất; `null` ⇒ chưa đủ số liệu để nhận định. */
  assessment: WellbeingAssessment | null;
}

/**
 * Mức tải gần đây (app.md p7-03 §2 `RiskLevelCard`): CHỮ (Thấp/Trung bình/Cao) + biểu tượng + một câu dịu + một lời khuyên. ⛔ KHÔNG số điểm (kế hoạch: "không số điểm to đáng sợ") và
 * không dùng đỏ — hai mức trên dùng tông `warning` dịu, phân biệt bằng chữ và biểu tượng chứ không chỉ màu (màu `warning` không đạt AA cho chữ thường). Cả khối đọc thành MỘT câu cho trình đọc
 * màn hình. Chưa đủ số liệu ⇒ nói thẳng cần thêm vài ngày (không bịa "Thấp" — trấn an giả tệ hơn không nói gì).
 */
export function RiskLevelCard({ assessment }: RiskLevelCardProps) {
  if (!assessment) {
    return (
      <Card>
        <View className="flex-row items-start gap-sm">
          <IconTile name="clock" size="lg" tone="neutral" />
          <View className="min-w-0 flex-1 gap-2xs">
            <Text accessibilityRole="header" className="text-label-lg font-semibold text-fg-1">
              Cần thêm vài ngày dữ liệu để đánh giá
            </Text>
            <Text className="text-body-md text-fg-2">
              {`Mình cần ít nhất ${String(WELLBEING_MIN_DAYS)} ngày có hoạt động để đưa ra nhận định. Cứ dùng ứng dụng như bình thường nhé.`}
            </Text>
          </View>
        </View>
      </Card>
    );
  }

  const copy = LEVEL_COPY[assessment.level];
  return (
    <Card>
      <View
        accessibilityLabel={`Mức tải gần đây: ${copy.label}. ${copy.headline}. ${copy.hint}`}
        accessible
        className="gap-sm"
      >
        <View className="flex-row items-center gap-sm">
          <IconTile name={copy.icon} size="lg" tone={copy.tone} />
          <View className="min-w-0 flex-1 gap-3xs">
            <Text className="text-label-md text-fg-2">Mức tải gần đây</Text>
            <Text className="text-header-sm font-semibold text-fg-1">{copy.label}</Text>
          </View>
        </View>
        <Text className="text-label-lg font-semibold text-fg-1">{copy.headline}</Text>
        <Text className="text-body-md text-fg-2">{copy.hint}</Text>
        <Text className="text-caption-sm text-fg-2">
          {`Cập nhật cho ngày ${formatDayMonth(assessment.date)}`}
        </Text>
      </View>
    </Card>
  );
}

import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import type { IconName } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { Section } from '@/shared/ui/section';

import type { RuleMetric, WellbeingFactor } from '../api/wellbeing.types';
import { factorSentence } from '../utils/factor-text';

/**
 * Ô icon theo LOẠI số đo của nhân tố (thời lượng liền mạch · hoạt động khuya · tổng thời gian · số thao tác) — mắt nhận ra
 * "chuyện gì" trước khi đọc câu. Một tông `info` dịu cho mọi nhân tố: đây là điều NHẬN THẤY, không phải lời cảnh báo (⛔ không
 * đỏ/cam, cùng tinh thần "không phán xét" của `factorSentence`). Số đo lạ (BE thêm trước app) ⇒ `analytics-02`.
 */
const METRIC_ICON: Partial<Record<RuleMetric, IconName>> = {
  activeMinutes: 'timer',
  eventsCount: 'analytics-02',
  lateNightEvents: 'clock',
  lateNightMinutes: 'clock',
  longestContinuousMinutes: 'history',
};

/**
 * "Điều mình nhận thấy" (app.md p7-03 §2 `FactorList`): các nhân tố khiến mức tải tăng, nói bằng câu dịu kèm con số CỦA CHÍNH người dùng (`factorSentence`) — không nêu điểm cộng,
 * không nêu ngưỡng, không phán xét. Không có nhân tố ⇒ không vẽ gì (không có gì để nói thì đừng chèn một khối trống).
 * Ô icon trước mỗi câu là trang trí (không nhãn) — nghĩa nằm hết ở câu chữ.
 */
export function FactorList({ factors }: { factors: readonly WellbeingFactor[] }) {
  if (factors.length === 0) return null;
  return (
    <Section icon="view" title="Điều mình nhận thấy gần đây">
      <Card>
        <View className="gap-sm">
          {factors.map((factor) => (
            <View key={factor.ruleId} className="flex-row items-center gap-sm">
              <IconTile name={METRIC_ICON[factor.metric] ?? 'analytics-02'} size="sm" tone="info" />
              <Text className="flex-1 text-body-md text-fg-1">{factorSentence(factor)}</Text>
            </View>
          ))}
        </View>
      </Card>
    </Section>
  );
}

import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';
import { LinkButton } from '@/shared/ui/button';
import { Section } from '@/shared/ui/section';
import { PATHS } from '@/shell/config';

import type { WellbeingSuggestion } from '../api/wellbeing.types';
import { SUGGESTION_COPY, SUGGESTION_ORDER } from '../constants/wellbeing-copy.constants';
import { WELLBEING_BREAK_HREF } from '../utils/wellbeing-routes';

/**
 * "Gợi ý cho bạn" (app.md p7-03 §2 `SuggestionList`): gợi ý CHÍNH theo nhân tố nặng nhất (BE `suggestion`) đứng đầu kèm nhãn "Gợi ý lúc này", rồi hai cách còn lại. Lời dịu, mang tính
 * mời ("thử…"), không ra lệnh. "Giãn bớt tiến độ" mở danh sách nhóm làm việc; "Nghỉ giải lao" (P1) mở `TakeABreakScreen` (vòng tròn hít thở 1 phút); ngủ sớm là việc ngoài app nên không có nút.
 * ⚠️ Kế hoạch còn nói "link sang Pomodoro" — Pomodoro chỉ nằm TRONG kênh của nhóm (không có màn độc lập), nên chưa có đích để dẫn tới đó cụ thể.
 * `primary = null` (không có nhân tố) ⇒ không vẽ gì.
 */
export function SuggestionList({ primary }: { primary: WellbeingSuggestion | null }) {
  if (!primary) return null;
  const ordered = [primary, ...SUGGESTION_ORDER.filter((item) => item !== primary)];

  return (
    <Section icon="magic-wand-01" title="Gợi ý cho bạn">
      <Card>
        <View className="gap-md">
          {ordered.map((item, index) => {
            const copy = SUGGESTION_COPY[item];
            return (
              <View key={item} className="flex-row items-start gap-sm">
                <IconTile name={copy.icon} size="sm" tone={index === 0 ? 'success' : 'neutral'} />
                <View className="min-w-0 flex-1 gap-3xs">
                  {index === 0 ? (
                    <Text className="text-label-sm font-semibold text-fg-brand">Gợi ý lúc này</Text>
                  ) : null}
                  <Text
                    accessibilityRole="header"
                    className="text-label-lg font-semibold text-fg-1"
                  >
                    {copy.title}
                  </Text>
                  <Text className="text-body-md text-fg-2">{copy.body}</Text>
                  {item === 'SPREAD_TASKS' ? (
                    <View className="items-start pt-2xs">
                      <LinkButton
                        iconRight="arrow-right-small"
                        label="Mở nhóm làm việc"
                        onPress={() => router.push(PATHS.WORKSPACES)}
                      />
                    </View>
                  ) : null}
                  {item === 'BREAK' ? (
                    <View className="items-start pt-2xs">
                      <LinkButton
                        iconRight="arrow-right-small"
                        label="Nghỉ 1 phút ngay"
                        onPress={() => router.push(WELLBEING_BREAK_HREF)}
                      />
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </Card>
    </Section>
  );
}

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Icon, type IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { cn } from '@/shared/utils/style/cn';

import type { OnboardingStepId } from '../store/onboarding.store';
import type { OnboardingStepView } from '../utils/onboarding.utils';
import { OnboardingChecklistHeader } from './OnboardingChecklistHeader';

/**
 * Ô icon của từng bước CHƯA xong — icon nói việc cần làm (mời · kênh · gửi tin), tông xoay cho ba bước khác nhau. Bước đã xong
 * đổi thành dấu tích tông `success`; chữ "Đã xong" vẫn đi kèm nên màu không bao giờ là dấu hiệu duy nhất.
 */
const STEP_ART: Record<OnboardingStepId, { icon: IconName; tone: IconTileTone }> = {
  invite: { icon: 'user-add', tone: 'brand' },
  channel: { icon: 'chat-bubble', tone: 'info' },
  message: { icon: 'direct', tone: 'accent' },
};

export interface OnboardingChecklistProps {
  steps: OnboardingStepView[];
  onDismiss: () => void;
  onStepPress: (id: OnboardingStepId) => void;
}

/**
 * Checklist "Mời → Kênh → Tin đầu" cho nhóm mới (app.md p1-01 §3): đầu thẻ có vòng tiến độ + nút thu gọn
 * (`OnboardingChecklistHeader`), thân là ba bước bấm được, chân là "Để sau" (ẩn hẳn). Làm xong cả ba thì hook tự ẩn thẻ.
 *
 * ✅ Thu gọn được (giữ trong phiên): người đã biết việc cần làm chỉ còn thấy một dòng tiến độ, khung lối vào lên gần hơn.
 * Thu gọn thì ẩn cả "Để sau" — mở ra mới bỏ qua hẳn được, tránh bấm nhầm vào việc không hoàn tác.
 *
 * ⚠️ Mỗi bước là NÚT mở màn làm việc đó (mời · danh sách kênh · kênh chung) — ⛔ không phải `checkbox`: trình đọc màn hình
 * xướng "hộp kiểm" thì người dùng chạm hai lần để ĐÁNH DẤU, nhưng thứ xảy ra là chuyển màn. Trạng thái xong đọc bằng CHỮ
 * ("Đã xong"/"Chưa xong") trong nhãn — trợ năng lẫn người khó phân biệt màu.
 */
export function OnboardingChecklist({ steps, onDismiss, onStepPress }: OnboardingChecklistProps) {
  const [expanded, setExpanded] = useState(true);
  const doneCount = steps.filter((step) => step.done).length;

  return (
    <Card
      footer={
        expanded ? (
          <Button fullWidth label="Để sau" size="sm" variant="neutral-tertiary" onPress={onDismiss} />
        ) : undefined
      }
    >
      <OnboardingChecklistHeader
        doneCount={doneCount}
        expanded={expanded}
        total={steps.length}
        onToggle={() => setExpanded((value) => !value)}
      />
      {expanded ? (
        <View className="gap-2xs">
          {steps.map((step) => (
            <Pressable
              key={step.id}
              accessibilityLabel={`${step.title}. ${step.done ? 'Đã xong' : 'Chưa xong'}`}
              accessibilityRole="button"
              onPress={() => onStepPress(step.id)}
            >
              {({ pressed }) => (
                // Nhấn = nền `bg-2` tràn 8dp mỗi bên (cùng khuôn `WorkspaceActionRow`); ⛔ `collapsable={false}`: nền chỉ có
                // LÚC NHẤN — Fabric/Android làm phẳng View không nền rồi vẽ vệt nhấn VUÔNG góc.
                <View
                  className={cn(
                    '-mx-xs min-h-12 flex-row items-center gap-sm rounded-xs px-xs py-2xs',
                    pressed && 'bg-bg-2',
                  )}
                  collapsable={false}
                >
                  <IconTile
                    name={step.done ? 'checkmark-circle' : STEP_ART[step.id].icon}
                    size="sm"
                    tone={step.done ? 'success' : STEP_ART[step.id].tone}
                  />
                  <View className="flex-1 gap-3xs">
                    <Text className={cn('text-label-md text-fg-1', step.done && 'text-fg-2 line-through')}>
                      {step.title}
                    </Text>
                    <Text className="text-caption-sm text-fg-2">
                      {step.done ? 'Đã xong' : step.description}
                    </Text>
                  </View>
                  <Icon color="fg-2" name="arrow-right-small" size={16} />
                </View>
              )}
            </Pressable>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

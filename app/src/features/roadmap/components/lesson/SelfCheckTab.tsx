import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { SPACING } from '@/shared/theme';
import { AutoGrowTextInput } from '@/shared/ui';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { EmptyState } from '@/shared/ui/empty-state';
import { IconTile } from '@/shared/ui/icon-tile';
import { Section } from '@/shared/ui/section';
import { hapticSelection } from '@/shared/utils/haptics';
import { cn } from '@/shared/utils/style/cn';

import type { RoadmapChecklistItemDto } from '../../api/roadmap.types';
import { SELF_RATING_OPTIONS } from '../../constants/roadmap.constants';
import type { LessonProgressView } from '../../hooks/useLessonProgress';
import { inlineMarkdownToSpans, inlineMarkdownToText } from '../../utils/inline-markdown';
import { Spans } from '../blocks/Spans';
import { MetaTag } from '../common/MetaTag';
import { ProgressBar } from '../common/ProgressBar';

export interface SelfCheckTabProps {
  header?: ReactNode;
  checklist: readonly RoadmapChecklistItemDto[];
  completing: boolean;
  /** "buổi" | "ngày" | "bài" — chữ thường, cho câu gợi ý hoàn thành. */
  unit: string;
  view: LessonProgressView;
  onComplete: () => void;
  onSetNote: (note: string) => void;
  onSetSelfRating: (rating: 1 | 2 | 3) => void;
  onToggleItem: (itemId: string) => void;
}

function groupChecklist(
  checklist: readonly RoadmapChecklistItemDto[],
): [string, RoadmapChecklistItemDto[]][] {
  const byGroup = new Map<string, RoadmapChecklistItemDto[]>();
  for (const item of checklist) {
    const key = item.group ?? 'Checklist';
    byGroup.set(key, [...(byGroup.get(key) ?? []), item]);
  }
  return Array.from(byGroup.entries());
}

/**
 * Tab Tự kiểm tra (app.md §3): thẻ tiến độ "Đã tick N/M" · checklist theo nhóm (Kiến thức/Kỹ năng/Bonus) · tự đánh giá
 * 😕🤔😊 · ghi chú riêng. Tick ĐỦ mà buổi chưa xong ⇒ thẻ tiến độ mời "Hoàn thành buổi" ngay tại chỗ (app.md §7.5).
 * Mỗi nhóm có icon nhỏ trước tiêu đề (mốc nhìn khi cuộn tab dài); tick mục / chọn mức tự đánh giá rung nhẹ `hapticSelection`.
 *
 * ⚠️ Mục checklist là dòng markdown thô của giáo trình ("Tôi viết được `<head>` **đầy đủ**…") — vẽ qua
 * `inlineMarkdownToSpans`, không in nguyên dấu sao/backtick.
 * ⚠️ `KeyboardAwareScrollView` (không phải `ScrollView` của RN) vì tab có ô nhập nhiều dòng (ghi chú) và `Screen`
 * cha chạy `scrollable={false}`. ⛔ `contentContainerClassName` bị `KeyboardAwareScrollView` BỎ QUA ÂM THẦM (không phải
 * component RN gốc, NativeWind không interop) — phải là `contentContainerStyle` (xem `Screen.tsx`).
 */
export function SelfCheckTab({
  checklist,
  completing,
  header,
  onComplete,
  onSetNote,
  onSetSelfRating,
  onToggleItem,
  unit,
  view,
}: SelfCheckTabProps) {
  const total = checklist.length;
  const checked = checklist.filter((item) => view.checkedItemIds.includes(item.id)).length;
  const done = view.status === 'COMPLETED';
  const allChecked = total > 0 && checked === total;

  return (
    <KeyboardAwareScrollView
      bottomOffset={24}
      className="flex-1"
      contentContainerStyle={{
        gap: SPACING.md,
        paddingHorizontal: SPACING.md,
        paddingTop: SPACING.xs,
        paddingBottom: SPACING['2xl'],
      }}
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      {header}
      {total > 0 ? (
        <View className="gap-sm rounded-md bg-bg-1 p-md">
          <View className="flex-row items-center gap-sm">
            {/* Ô icon đổi sang tông "xong" khi tick đủ — kèm chữ "N/M mục" nên màu không phải dấu hiệu duy nhất. */}
            <IconTile name="checkmark-square" size="sm" tone={allChecked ? 'success' : 'brand'} />
            <Text className="flex-1 text-label-lg font-semibold text-fg-1">
              {`Đã tự kiểm tra ${String(checked)}/${String(total)} mục`}
            </Text>
            {done ? (
              <MetaTag icon="checkmark-circle" label={`Đã hoàn thành ${unit}`} tone="success" />
            ) : null}
          </View>
          <ProgressBar percent={(checked / total) * 100} tone={allChecked ? 'success' : 'brand'} />
          {allChecked && !done ? (
            <View className="gap-xs">
              <Text className="text-body-md text-fg-2">{`Bạn đã tick đủ mọi mục — đánh dấu hoàn thành ${unit} nhé.`}</Text>
              <Button
                fullWidth
                label={`Hoàn thành ${unit}`}
                loading={completing}
                size="sm"
                onPress={onComplete}
              />
            </View>
          ) : null}
        </View>
      ) : (
        <EmptyState
          description={`${unit.charAt(0).toUpperCase()}${unit.slice(1)} này chưa có mục tự kiểm tra.`}
          icon="checkmark-square"
          size="compact"
          tone="success"
        />
      )}

      {groupChecklist(checklist).map(([group, items]) => (
        <Section key={group} icon="checkmark-square" title={group}>
          <View className="gap-2xs">
            {items.map((item) => (
              <Checkbox
                key={item.id}
                accessibilityLabel={inlineMarkdownToText(item.text)}
                checked={view.checkedItemIds.includes(item.id)}
                label={
                  <Text className="text-body-md text-fg-1">
                    <Spans spans={inlineMarkdownToSpans(item.text)} />
                  </Text>
                }
                onChange={() => {
                  // Tick/bỏ tick là đổi lựa chọn ⇒ nhịp `selection` (nhẹ nhất) — thanh tiến độ phía trên đổi theo ngay.
                  hapticSelection();
                  onToggleItem(item.id);
                }}
              />
            ))}
          </View>
        </Section>
      ))}

      <Section icon="star" title="Tự đánh giá">
        <View accessibilityRole="radiogroup" className="flex-row gap-sm">
          {SELF_RATING_OPTIONS.map((option) => {
            const selected = view.selfRating === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityLabel={option.label}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                className={cn(
                  'flex-1 items-center gap-3xs rounded-sm border p-sm active:opacity-80',
                  selected ? 'border-border-brand bg-surface-primary' : 'border-border-1 bg-bg-1',
                )}
                onPress={() => {
                  if (!selected) hapticSelection();
                  onSetSelfRating(option.value);
                }}
              >
                <Text className="text-header-md">{option.emoji}</Text>
                <Text
                  className={cn(
                    'text-caption-sm',
                    selected ? 'font-semibold text-fg-brand' : 'text-fg-2',
                  )}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section icon="edit" title="Ghi chú của bạn">
        <View className="rounded-sm border border-border-1 bg-bg-1 px-sm py-xs">
          <AutoGrowTextInput
            accessibilityLabel={`Ghi chú riêng cho ${unit} này`}
            className="text-body-md text-fg-1"
            placeholder={`Ghi chú riêng cho ${unit} này…`}
            value={view.note ?? ''}
            onChangeText={onSetNote}
          />
        </View>
      </Section>
    </KeyboardAwareScrollView>
  );
}

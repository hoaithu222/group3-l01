import { useRef } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';

import { SPACING } from '@/shared/theme';
import { Icon } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';
import { hapticSelection } from '@/shared/utils/haptics';
import { cn } from '@/shared/utils/style/cn';

import type { RoadmapPhaseDto } from '../../api/roadmap.types';
import { phaseTone } from '../../constants/roadmap.constants';
import type { PhaseStats } from '../../types/roadmap-insights.types';
import { ProgressBar } from '../common/ProgressBar';

export interface PhaseTabsProps {
  /** "buổi" | "ngày" — chữ thường, cho nhãn trợ năng. */
  unit: string;
  phases: readonly RoadmapPhaseDto[];
  stats: Readonly<Record<string, PhaseStats>>;
  value: string;
  onChange: (phaseId: string) => void;
}

/** Ô đang chọn: nền nhạt + viền CÙNG tông tháng. Chuỗi class viết ĐỦ để `check:classes` soát được (⛔ không ghép động). */
const SELECTED_CLASS: Record<IconTileTone, string> = {
  accent: 'border-action-accent bg-surface-secondary',
  brand: 'border-border-brand bg-surface-primary',
  danger: 'border-border-error bg-surface-error',
  info: 'border-border-info bg-surface-info',
  neutral: 'border-border-strong bg-surface-neutral',
  success: 'border-border-success bg-surface-success',
  warning: 'border-border-warning bg-surface-warning',
};

function statusText(stats: PhaseStats | undefined): string {
  if (!stats || stats.state === 'empty') return 'Đang soạn';
  if (stats.state === 'done') return 'Xong';
  if (stats.state === 'current') return 'Đang học';
  return `${String(stats.done)}/${String(stats.total)}`;
}

/**
 * Dải THÁNG T1…T8 (app.md §3) cuộn ngang: mỗi tháng một ô có màu tháng (`phaseTone`), trạng thái (Xong / Đang học /
 * 3/8) và thanh tiến độ mảnh — nhìn một lượt biết mình đang ở tháng nào, tháng nào đã xong.
 *
 * ⚠️ Không dùng `Tabs` của bộ chung: (1) khay viên nén `scrollable` chỉ rộng bằng nội dung nên dừng lưng chừng màn
 * (ảnh chụp thật), (2) `Tabs` chỉ có một màu thương hiệu, không mang được màu tháng lẫn tiến độ. Vai `tablist`/`tab` +
 * `selected` giữ đúng như `Tabs` để trình đọc màn hình đọc giống hệt.
 */
export function PhaseTabs({ onChange, phases, stats, unit, value }: PhaseTabsProps) {
  const scrollRef = useRef<ScrollView>(null);
  const scrolledRef = useRef(false);

  // Mở màn ở tháng ĐANG HỌC (có thể là T5) ⇒ cuộn dải tháng cho ô đó lọt vào tầm nhìn, một lần duy nhất.
  const handleLayout = (phaseId: string) => (event: LayoutChangeEvent) => {
    if (scrolledRef.current || phaseId !== value) return;
    scrolledRef.current = true;
    scrollRef.current?.scrollTo({
      animated: false,
      x: Math.max(0, event.nativeEvent.layout.x - SPACING.md),
    });
  };

  return (
    <ScrollView
      ref={scrollRef}
      // ⛔ `grow-0`: ScrollView ngang mặc định `flexGrow: 1` — trong cột dọc nó chia chỗ trống với nội dung bên dưới.
      className="grow-0"
      contentContainerStyle={{ paddingHorizontal: SPACING.md }}
      horizontal
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      <View accessibilityRole="tablist" className="flex-row gap-xs">
        {phases.map((phase) => {
          const selected = phase.id === value;
          const phaseStats = stats[phase.id];
          const tone = phaseTone(phase);
          const done = phaseStats?.state === 'done';
          const percent =
            phaseStats && phaseStats.total > 0 ? (phaseStats.done / phaseStats.total) * 100 : 0;
          const spoken = [
            `Tháng ${String(phase.index)}`,
            phase.title,
            phaseStats && phaseStats.total > 0
              ? `đã học ${String(phaseStats.done)} trên ${String(phaseStats.total)} ${unit}`
              : 'nội dung đang soạn',
            phaseStats?.state === 'current' ? 'đang học' : done ? 'đã xong' : null,
          ]
            .filter(Boolean)
            .join(', ');
          return (
            <Pressable
              key={phase.id}
              accessibilityLabel={spoken}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              className={cn(
                // `active:opacity-80`: ô tháng phản hồi ngay lúc chạm (Android không có gợn sóng mặc định).
                'min-h-14 min-w-16 justify-between gap-2xs rounded-sm border px-sm py-xs active:opacity-80',
                selected ? SELECTED_CLASS[tone] : 'border-border-1 bg-bg-1',
              )}
              onLayout={handleLayout(phase.id)}
              onPress={() => {
                // Rung "đổi lựa chọn" chỉ khi THẬT SỰ đổi tháng — chạm lại ô đang chọn không có gì để xác nhận.
                if (!selected) hapticSelection();
                onChange(phase.id);
              }}
            >
              <View className="flex-row items-center gap-3xs">
                <Text
                  className={cn(
                    'text-label-md font-semibold',
                    selected ? 'text-fg-1' : 'text-fg-2',
                  )}
                >
                  {`T${String(phase.index)}`}
                </Text>
                {done ? <Icon color="success" name="checkmark-circle" size="xs" /> : null}
              </View>
              <Text
                className={cn(
                  'text-caption-sm',
                  phaseStats?.state === 'current' ? 'font-semibold text-fg-brand' : 'text-fg-2',
                )}
                numberOfLines={1}
              >
                {statusText(phaseStats)}
              </Text>
              <ProgressBar percent={percent} size="sm" tone={done ? 'success' : tone} />
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

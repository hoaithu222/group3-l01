import { Text, View } from 'react-native';

import { Icon, type IconName } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import type { GanttStatusKind } from '../../utils/gantt-status';

const ICON: Record<GanttStatusKind, IconName> = {
  blocked: 'lock',
  conflict: 'alert-warning',
  critical: 'flash',
  done: 'checkmark-circle',
};

export interface GanttStatusChipProps {
  kind: GanttStatusKind;
  label: string;
}

/**
 * Nhãn trạng thái của một thẻ trên Gantt/danh sách mốc: **icon + chữ** ("Đường găng", "Xung đột lịch", "Bị chặn bởi A
 * (chưa xong)") — không bao giờ chỉ màu (app.md §7). Nền `surface-*` là màu ĐẶC đi với chữ `fg-1`; màu chỉ tô thêm cho
 * viền và icon để nhìn lướt vẫn phân biệt được.
 */
export function GanttStatusChip({ kind, label }: GanttStatusChipProps) {
  const tone =
    kind === 'conflict'
      ? { border: 'border-border-warning-subtle', fill: 'bg-surface-warning', icon: 'warning' as const }
      : kind === 'critical'
        ? { border: 'border-border-error-subtle', fill: 'bg-surface-error', icon: 'error' as const }
        : kind === 'done'
          ? { border: 'border-border-success-subtle', fill: 'bg-surface-success', icon: 'success' as const }
          : { border: 'border-border-1', fill: 'bg-surface-neutral', icon: 'fg-2' as const };

  return (
    <View
      accessibilityLabel={label}
      accessible
      className={cn(
        'flex-row items-center gap-3xs self-start rounded-full border-hairline px-xs py-3xs',
        tone.border,
        tone.fill,
      )}
    >
      <Icon color={tone.icon} name={ICON[kind]} size={14} />
      <Text className="shrink text-label-sm text-fg-1" maxFontSizeMultiplier={1.3} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

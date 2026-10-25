import { Text, View } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

export type SummaryStatTone = 'error' | 'info' | 'neutral' | 'success' | 'warning';

/** Nền `surface-*` + viền `-subtle` cùng họ; chữ luôn `fg-1`/`fg-2` (≥ 4.9:1 trên mọi `surface-*` ở cả hai chế độ). */
const SURFACE: Record<SummaryStatTone, string> = {
  error: 'border-border-error-subtle bg-surface-error',
  info: 'border-border-info-subtle bg-surface-info',
  neutral: 'border-border-1 bg-surface-neutral',
  success: 'border-border-success-subtle bg-surface-success',
  warning: 'border-border-warning-subtle bg-surface-warning',
};

export interface SummaryStatProps {
  label: string;
  tone: SummaryStatTone;
  value: number;
  className?: string;
}

/**
 * Ô số liệu ở màn tổng kết: con số to + nhãn. Cả ô là MỘT phần tử trợ năng đọc "Đã thuộc: 7 thẻ" (số trần "7" đọc lên vô nghĩa).
 * Cục bộ vì bộ chung chưa có ô số liệu có tông màu (`Badge` là nhãn trạng thái một dòng, `Card` không có tông); dùng ở hai màn
 * tổng kết (Học thẻ, Ôn theo lịch). Màu chỉ là nền — nghĩa nằm ở chữ nhãn.
 */
export function SummaryStat({ className, label, tone, value }: SummaryStatProps) {
  return (
    <View
      accessibilityLabel={`${label}: ${value} thẻ`}
      accessible
      className={cn('flex-1 items-center rounded-md border-hairline px-xs py-sm', SURFACE[tone], className)}
    >
      <Text className="text-header-sm text-fg-1">{String(value)}</Text>
      <Text className="text-center text-label-sm text-fg-2" maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </View>
  );
}

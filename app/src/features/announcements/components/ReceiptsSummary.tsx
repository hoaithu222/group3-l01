import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { ProgressRing } from '@/shared/ui/progress-ring';
import { Skeleton } from '@/shared/ui/skeleton';
import { formatDateTime } from '@/shared/utils/format/date.utils';

export interface ReceiptsSummaryProps {
  /** `null` = chưa có số liệu (đang tải lần đầu). */
  counts: { audience: number; confirmed: number } | null;
  deadlineAt: string | null | undefined;
}

/** Đường kính vòng tiến độ — 48 để chữ phần trăm (10/16) nằm gọn trong lòng vòng. */
const RING_SIZE = 48;

/**
 * Thẻ tổng quan đầu màn: vòng tiến độ (phần trăm đã xác nhận, đủ người ⇒ tông `success`) + "12/40 đã xác nhận" + hạn (kèm icon đồng hồ).
 * Số đếm giống nhau ở cả hai tab nên giữ nguyên khi đổi tab. Vòng chỉ là hình minh hoạ cho con số — chữ "12/40" vẫn là thông tin chính,
 * và phần trăm đọc được qua `accessibilityValue` của `ProgressRing`.
 */
export function ReceiptsSummary({ counts, deadlineAt }: ReceiptsSummaryProps) {
  const ratio = counts && counts.audience > 0 ? counts.confirmed / counts.audience : 0;
  const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  const done = counts !== null && counts.audience > 0 && counts.confirmed >= counts.audience;

  return (
    <View className="px-md pt-xs">
      <Card className="flex-row items-center gap-md">
        {counts ? (
          <ProgressRing
            label="Tiến độ xác nhận đã đọc"
            progress={ratio}
            size={RING_SIZE}
            tone={done ? 'success' : 'brand'}
          >
            <Text className="text-label-xs font-semibold text-fg-1" maxFontSizeMultiplier={1.3}>
              {`${String(percent)}%`}
            </Text>
          </ProgressRing>
        ) : (
          <Skeleton className="h-12 w-12" variant="circle" />
        )}
        <View className="flex-1 gap-3xs">
          {counts ? (
            <Text className="text-label-lg font-semibold text-fg-1">
              {counts.confirmed}/{counts.audience} đã xác nhận
            </Text>
          ) : (
            <Skeleton className="h-6 w-40 rounded-md" />
          )}
          {deadlineAt ? (
            <View className="flex-row items-center gap-3xs">
              <Icon color="fg-2" name="clock" size={14} />
              <Text className="text-caption-sm text-fg-2">Hạn {formatDateTime(deadlineAt)}</Text>
            </View>
          ) : null}
        </View>
      </Card>
    </View>
  );
}

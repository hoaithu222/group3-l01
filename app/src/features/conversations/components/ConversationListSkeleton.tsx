import { View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';

export interface ConversationListSkeletonProps {
  /** Số thẻ giữ chỗ — app.md §3 chốt 8 ở màn danh sách chính. */
  rows?: number;
}

/**
 * Khung xương lúc tải danh sách hội thoại — ĐÚNG dáng `ConversationCard` (khung `Card` viền mảnh, lề 16, khe 8; avatar tròn 48 +
 * dòng tên + dòng xem trước, đệm 12): lúc dữ liệu về, thẻ thật nằm đè đúng chỗ khung xương thay vì cả danh sách nhảy bố cục.
 */
export function ConversationListSkeleton({ rows = 8 }: ConversationListSkeletonProps) {
  return (
    <View accessibilityLabel="Đang tải danh sách hội thoại" accessible>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} className="px-md pb-xs">
          <Card
            className="flex-row items-center gap-sm border-hairline border-border-1 p-sm"
            padded={false}
          >
            <Skeleton className="h-12 w-12" variant="circle" />
            <View className="flex-1 gap-xs">
              <Skeleton width="45%" />
              <Skeleton width="75%" />
            </View>
          </Card>
        </View>
      ))}
    </View>
  );
}

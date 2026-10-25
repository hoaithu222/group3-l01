import { View } from 'react-native';

import { Skeleton } from '@/shared/ui/skeleton';

/**
 * Khung xương của lịch sử cuộc gọi — ĐÚNG dáng `CallHistoryItem` (avatar tròn 48 · tên · dòng kết quả · nút gọi lại 40, cùng
 * `px-md py-sm`), để dữ liệu về thì hàng thật nằm đè đúng chỗ. Bản cũ là tám khối chữ nhật bo 24 — không giống hàng nào.
 */
export function CallHistorySkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <View
      accessibilityLabel="Đang tải lịch sử cuộc gọi"
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      accessible
    >
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} className="flex-row items-center gap-sm px-md py-sm">
          <Skeleton className="h-12 w-12" variant="circle" />
          <View className="flex-1 gap-xs">
            <Skeleton width="55%" />
            <Skeleton width="35%" />
          </View>
          <Skeleton className="h-10 w-10" variant="circle" />
        </View>
      ))}
    </View>
  );
}

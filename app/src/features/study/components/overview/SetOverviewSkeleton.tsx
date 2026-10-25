import { View } from 'react-native';

import { Skeleton } from '@/shared/ui/skeleton';

/**
 * Khung xương của tổng quan bộ: dựng đúng KHUÔN của trang thật — thẻ hero (bìa + tiêu đề + hai dòng + hàng viên số liệu) rồi tới nút chính và
 * lưới ô luyện tập. Cùng bố cục hai cột từ `tablet:` (600dp) với `SetOverviewScreen`, nên trang thật thế chỗ mà không nhảy. Nhãn "Đang tải…" + `busy`
 * để người dùng khiếm thị biết đang chờ (khung xương thuần hình thì trình đọc màn hình không nói gì).
 */
export function SetOverviewSkeleton() {
  return (
    <View
      accessibilityLabel="Đang tải bộ học"
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      accessible
      className="gap-md py-xs tablet:flex-row tablet:items-start tablet:gap-xl"
    >
      <View className="overflow-hidden rounded-md bg-bg-1 tablet:flex-1">
        <Skeleton className="h-40 rounded-none" />
        <View className="gap-sm p-md">
          <Skeleton className="h-lg w-3/4" />
          <Skeleton className="w-1/2" />
          <View className="flex-row gap-xs">
            <Skeleton className="h-lg w-1/4" />
            <Skeleton className="h-lg w-1/4" />
          </View>
        </View>
      </View>
      <View className="gap-md tablet:flex-1">
        <Skeleton className="h-control-lg rounded-full" />
        <View className="flex-row gap-sm">
          <Skeleton className="h-32 flex-1 rounded-md" />
          <Skeleton className="h-32 flex-1 rounded-md" />
        </View>
      </View>
    </View>
  );
}

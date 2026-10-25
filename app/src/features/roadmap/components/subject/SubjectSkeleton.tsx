import { View } from 'react-native';

import { Skeleton } from '@/shared/ui/skeleton';

/**
 * Khung xương đúng khuôn màn tổng quan môn: thẻ tiến độ · dải tháng · thẻ tháng · vài buổi trên đường thời gian — dữ liệu về
 * không làm bố cục nhảy. Tách khỏi `RoadmapSubjectScreen` để màn đó giữ dưới trần 200 dòng.
 */
export function SubjectSkeleton() {
  return (
    <View className="gap-md px-md pt-xs">
      <Skeleton className="h-36 rounded-md" />
      <Skeleton className="h-12 rounded-md" />
      <View className="flex-row gap-xs">
        <Skeleton className="h-14 w-16 rounded-sm" />
        <Skeleton className="h-14 w-16 rounded-sm" />
        <Skeleton className="h-14 w-16 rounded-sm" />
      </View>
      <Skeleton className="h-28 rounded-md" />
      <Skeleton className="h-20 rounded-md" />
      <Skeleton className="h-20 rounded-md" />
    </View>
  );
}

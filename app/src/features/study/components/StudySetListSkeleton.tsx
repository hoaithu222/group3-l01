import { View } from 'react-native';

import { Skeleton } from '@/shared/ui/skeleton';

/** Số thẻ giả — đủ lấp một màn điện thoại thấp, không đủ để người dùng tưởng danh sách vô tận. */
const ROWS = ['a', 'b', 'c', 'd'] as const;

/**
 * Khung xương của danh sách bộ học: MỖI dòng giả dựng đúng khuôn `StudySetCard` (ô bìa 64 + tiêu đề + hai viên số liệu) nên khi dữ
 * liệu về, thẻ thật thế chỗ mà danh sách không nhảy. Cùng lề (`px-md`) và khe (`pb-sm`) với thẻ thật.
 *
 * ⚠️ `animated` mặc định bật (nhịp thở của `Skeleton`); nhãn "Đang tải…" nằm ở `StudySetList` bọc ngoài.
 */
export function StudySetListSkeleton() {
  return (
    <View className="gap-sm px-md pb-sm">
      {ROWS.map((row) => (
        <View key={row} className="flex-row items-center gap-sm rounded-md bg-bg-1 p-sm">
          <Skeleton className="h-6xl w-6xl rounded-sm" />
          <View className="flex-1 gap-xs">
            <Skeleton className="w-3/4" />
            <View className="flex-row gap-xs">
              <Skeleton className="h-lg w-1/4" />
              <Skeleton className="h-lg w-1/4" />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

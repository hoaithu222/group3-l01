import { View } from 'react-native';

import { Skeleton } from '@/shared/ui/skeleton';

export interface PersonRowsSkeletonProps {
  /** Nhãn cho trình đọc màn hình — nói ĐANG TẢI GÌ ("Đang tải danh sách thành viên"). */
  label?: string;
  rows?: number;
}

/**
 * Khung xương cho các danh sách NGƯỜI của `conversations` (tìm người, thêm thành viên, thành viên nhóm, chọn nhóm làm việc) — ĐÚNG dáng
 * hàng thật (`PeoplePickerList`/`MemberRow`: avatar tròn 40 + dòng tên + dòng phụ, cùng `px-md py-sm`), để dữ liệu về thì hàng thật nằm
 * đè đúng chỗ. Bản cũ là các khối chữ nhật bo 24 cao 56 — không giống hàng nào, và danh sách giật bố cục khi tải xong.
 * (Danh sách HỘI THOẠI dùng `ConversationListSkeleton` — avatar 48, khác cỡ.)
 */
export function PersonRowsSkeleton({
  label = 'Đang tải danh sách',
  rows = 6,
}: PersonRowsSkeletonProps) {
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      accessible
    >
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} className="flex-row items-center gap-sm px-md py-sm">
          <Skeleton className="h-10 w-10" variant="circle" />
          <View className="flex-1 gap-xs">
            <Skeleton width="50%" />
            <Skeleton width="30%" />
          </View>
        </View>
      ))}
    </View>
  );
}

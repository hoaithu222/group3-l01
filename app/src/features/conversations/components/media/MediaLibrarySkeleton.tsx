import { View } from 'react-native';

import { Skeleton } from '@/shared/ui/skeleton';

import type { MediaKind } from '../../api/conversations.types';

/**
 * Khung xương của `MediaLibraryScreen` theo ĐÚNG dáng tab đang mở: lưới ô vuông 3 cột cho Ảnh/Video (cùng `w-[32%]` của `MediaGrid`),
 * hàng ô icon 40 + hai dòng chữ cho Tệp/Liên kết (cùng `FileList`/`LinkList`). Bản cũ là bốn khối chữ nhật cho cả ba tab — lúc dữ liệu
 * về, lưới ảnh "nhảy" từ bốn thanh ngang sang chín ô vuông.
 */
export function MediaLibrarySkeleton({ kind }: { kind: MediaKind }) {
  if (kind === 'MEDIA') {
    return (
      <View
        accessibilityLabel="Đang tải ảnh và video"
        accessible
        className="flex-row flex-wrap justify-between gap-2xs px-md"
      >
        {Array.from({ length: 9 }, (_, index) => (
          <View key={index} className="aspect-square w-[32%]">
            <Skeleton className="h-full w-full rounded-2xs" variant="rect" />
          </View>
        ))}
      </View>
    );
  }

  return (
    <View accessibilityLabel={kind === 'FILE' ? 'Đang tải tệp' : 'Đang tải liên kết'} accessible>
      {Array.from({ length: 5 }, (_, index) => (
        <View key={index} className="flex-row items-center gap-sm px-md py-sm">
          <Skeleton className="h-10 w-10" variant="rect" />
          <View className="flex-1 gap-xs">
            <Skeleton width="60%" />
            <Skeleton width="35%" />
          </View>
        </View>
      ))}
    </View>
  );
}

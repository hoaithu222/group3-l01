import { ScrollView, View } from 'react-native';

import { Thumbnail } from '@/shared/ui/card';

import type { LocationPhoto } from '../api/o2o.types';

/**
 * Ảnh địa điểm (băng chuyền ngang). URL KÝ sống rất ngắn (BE cắt còn ~60 s — `fileUrlTtlSeconds` bị chặn bởi `signedUrlTtlMaxSeconds`), nên chi tiết địa điểm
 * để `staleTime` ngắn và ảnh hết hạn thì `Thumbnail` rơi về ô giữ chỗ chứ không vỡ. Ảnh không có URL (`null`) bị bỏ; không còn ảnh nào thì không vẽ gì.
 * `grow-0` — `ScrollView` ngang của RN mặc định `flexGrow: 1`, trong cột dọc nó phình cao ra.
 */
export function PhotoCarousel({ photos, name }: { photos: LocationPhoto[]; name: string }) {
  const visible = photos.filter((photo) => photo.url || photo.thumbUrl);
  if (visible.length === 0) return null;

  return (
    <ScrollView
      className="grow-0"
      horizontal
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row gap-xs">
        {visible.map((photo, index) => (
          <View key={photo.assetId} className="w-72">
            <Thumbnail
              alt={`Ảnh ${index + 1} của ${name}`}
              aspect={16 / 9}
              source={{ uri: photo.url ?? photo.thumbUrl ?? undefined }}
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

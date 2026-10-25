import { Image } from 'expo-image';
import { cssInterop } from 'nativewind';
import { useState } from 'react';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { Skeleton } from '@/shared/ui/skeleton';

import { useResourceUrl } from '../../hooks/useResourceUrl';
import type { PreviewProps } from './preview.types';
import { UnsupportedPreview } from './UnsupportedPreview';
import { useZoomGesture } from './useZoomGesture';

/** ⛔ `Image` của `expo-image` không nằm trong danh sách NativeWind hiểu `className`. */
const ZoomImage = cssInterop(Image, { className: 'style' });

/**
 * Xem ảnh, phóng bằng pinch/chạm đúp. `cachePolicy: 'none'`: URL ký sống 60 s
 * nên cache đĩa vô ích và để ảnh riêng tư lại trên máy. Lỗi tải (URL hết hạn —
 * 403 từ storage) ⇒ xin URL MỚI đúng MỘT lần rồi mới báo lỗi (app.md p3-01 §3),
 * cùng quy ước `useAssetUrl` của p0-05.
 */
export function ImagePreview({ onDownload, onOpenExternal, resource, variant }: PreviewProps) {
  const url = useResourceUrl(resource.id, variant);
  const zoom = useZoomGesture();
  const [retried, setRetried] = useState(false);
  const [failed, setFailed] = useState(false);

  if (url.isError || failed) {
    return (
      <UnsupportedPreview
        actions={[
          { label: 'Mở bằng ứng dụng khác', onPress: onOpenExternal },
          { label: 'Tải về', onPress: onDownload, variant: 'secondary' },
        ]}
        reason="error"
      />
    );
  }
  if (url.isLoading || !url.data) return <Skeleton className="h-full w-full" />;

  return (
    <View
      className="flex-1 overflow-hidden bg-ink-10"
      onLayout={(event) => zoom.onLayout(event.nativeEvent.layout)}
    >
      <GestureDetector gesture={zoom.gesture}>
        <Animated.View cssInterop={false} style={[{ flex: 1 }, zoom.style]}>
          <ZoomImage
            accessibilityLabel={`Ảnh ${resource.name}`}
            cachePolicy="none"
            className="h-full w-full"
            contentFit="contain"
            recyclingKey={resource.id}
            source={{ uri: url.data.url }}
            testID="image-preview"
            onError={() => {
              if (retried) {
                setFailed(true);
                return;
              }
              setRetried(true);
              void url.refresh();
            }}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

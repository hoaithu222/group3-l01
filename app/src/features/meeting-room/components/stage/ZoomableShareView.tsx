import type { ReactNode } from 'react';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { useShareZoomGesture } from './useShareZoomGesture';

export interface ZoomableShareViewProps {
  /** Nội dung phóng được — thường là video màn hình chia sẻ (`renderVideo(screenShareRef, { objectFit: 'contain' })`). */
  children: ReactNode;
  /** Chạm đơn (sau khi chắc không phải chạm đúp) — cha bật/tắt toàn màn hình. */
  onTap?: () => void;
}

/**
 * Khung phóng/kéo cho màn hình được chia sẻ: pinch, kéo khi đã phóng, chạm đúp 1×↔2×.
 *
 * ⚠️ `overflow-hidden` ở khung ngoài: nội dung đã phóng tràn ra ngoài mép phải bị cắt, không đè lên dải thumbnail/nút bên cạnh.
 * ⚠️ Cử chỉ chỉ chạy trên máy thật (Jest chỉ dựng cây con) — xem chú thích ở `useShareZoomGesture`.
 */
export function ZoomableShareView({ children, onTap }: ZoomableShareViewProps) {
  const zoom = useShareZoomGesture(onTap);

  return (
    <View className="flex-1 overflow-hidden" onLayout={(event) => zoom.onLayout(event.nativeEvent.layout)}>
      <GestureDetector gesture={zoom.gesture}>
        <Animated.View cssInterop={false} style={[{ flex: 1 }, zoom.style]}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

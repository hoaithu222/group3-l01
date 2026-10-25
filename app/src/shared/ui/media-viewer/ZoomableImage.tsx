import { useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Image } from 'expo-image';
import { cssInterop } from 'nativewind';

import { clamp, doubleTapScale, isZoomed, panLimit, pinchScale, shouldDismiss } from './zoom-math';

/** ⛔ `Image` của expo-image không có trong danh sách interop của NativeWind — thiếu bước này `className` bị bỏ ÂM THẦM (xem `Avatar`). */
const ViewerImage = cssInterop(Image, { className: 'style' });

const ZOOM_MS = 200;

export interface ZoomableImageProps {
  accessibilityLabel?: string;
  height: number;
  /** Kéo xuống đủ xa/đủ nhanh khi CHƯA zoom. */
  onDismiss: () => void;
  /** Báo khi vào/ra trạng thái zoom — pager ngoài khoá/mở cuộn ngang theo đó. */
  onZoomChange: (zoomed: boolean) => void;
  uri: string;
  width: number;
}

/**
 * Trang ảnh của `MediaViewer`: pinch để phóng (tới 4×), chạm đúp để phóng/thu, kéo khi đang phóng để xem chỗ khác, kéo XUỐNG khi chưa
 * phóng để đóng (p0-12). `contentFit="contain"` — luôn thấy trọn ảnh lúc chưa phóng.
 *
 * ── Cử chỉ ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 * Hai pan RIÊNG, bật theo trạng thái zoom: (1) pan DỌC vuốt-đóng, chỉ nhận kéo dọc (`activeOffsetY`, hỏng khi lệch ngang
 * `failOffsetX`) để không tranh với pager ngang; (2) pan tự do khi đang phóng — lúc đó pager đã bị khoá cuộn ngang
 * (`scrollEnabled=false` ở `MediaViewer`), không còn ai tranh. Số học thuần ở `zoom-math.ts` (có test).
 *
 * ⚠️ CHƯA kiểm trên thiết bị thật (Jest không mô phỏng được cử chỉ): người phát hành phải thử pinch / chạm đúp / vuốt-đóng trên
 * Android + iOS trước khi nối `MediaViewer` vào màn nào.
 *
 * Trợ năng: người dùng không pinch được vẫn xem trọn ảnh (contain) — không có hành động nào CHỈ có ở cử chỉ. Animation ngắn (200ms),
 * TẮT khi bật "Giảm chuyển động".
 */
export function ZoomableImage({
  accessibilityLabel,
  height,
  onDismiss,
  onZoomChange,
  uri,
  width,
}: ZoomableImageProps) {
  const reduceMotion = useReducedMotion();
  const duration = reduceMotion ? 0 : ZOOM_MS;
  const [zoomed, setZoomed] = useState(false);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const reportZoom = (next: boolean) => {
    setZoomed(next);
    onZoomChange(next);
  };

  const reset = () => {
    'worklet';
    scale.set(withTiming(1, { duration }));
    x.set(withTiming(0, { duration }));
    y.set(withTiming(0, { duration }));
    savedScale.set(1);
    savedX.set(0);
    savedY.set(0);
  };

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      'worklet';
      scale.set(pinchScale(savedScale.get(), event.scale));
    })
    .onEnd(() => {
      'worklet';
      if (isZoomed(scale.get())) {
        savedScale.set(scale.get());
        scheduleOnRN(reportZoom, true);
      } else {
        reset();
        scheduleOnRN(reportZoom, false);
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      const next = doubleTapScale(scale.get());
      if (next === 1) {
        reset();
      } else {
        scale.set(withTiming(next, { duration }));
        savedScale.set(next);
      }
      scheduleOnRN(reportZoom, next > 1);
    });

  // Đang phóng: kéo tự do nhưng không quá mép ảnh.
  const movePan = Gesture.Pan()
    .enabled(zoomed)
    .onUpdate((event) => {
      'worklet';
      const limitX = panLimit(width, scale.get());
      const limitY = panLimit(height, scale.get());
      x.set(clamp(savedX.get() + event.translationX, -limitX, limitX));
      y.set(clamp(savedY.get() + event.translationY, -limitY, limitY));
    })
    .onEnd(() => {
      'worklet';
      savedX.set(x.get());
      savedY.set(y.get());
    });

  // Chưa phóng: chỉ nhận kéo DỌC; kéo xuống đủ xa/nhanh thì đóng.
  const dismissPan = Gesture.Pan()
    .enabled(!zoomed)
    .activeOffsetY([-15, 15])
    .failOffsetX([-15, 15])
    .onUpdate((event) => {
      'worklet';
      y.set(event.translationY);
    })
    .onEnd((event) => {
      'worklet';
      if (shouldDismiss(event.translationY, event.velocityY)) scheduleOnRN(onDismiss);
      else y.set(withTiming(0, { duration }));
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: scale.get() }],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, doubleTap, movePan, dismissPan)}>
      <View collapsable={false} style={{ height, width }}>
        <Animated.View cssInterop={false} style={[{ height, width }, style]}>
          <ViewerImage
            accessibilityLabel={accessibilityLabel}
            accessible={Boolean(accessibilityLabel)}
            contentFit="contain"
            source={{ uri }}
            style={{ height, width }}
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

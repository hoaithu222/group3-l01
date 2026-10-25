import { useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { SvgXml } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { clamp, doubleTapScale, isZoomed, panLimit, pinchScale } from '@/shared/ui/media-viewer/zoom-math';

const ZOOM_MS = 200;

export interface ZoomableSvgProps {
  accessibilityLabel: string;
  /** Kích thước KHUNG xem (dp) — hình tự co vừa khung theo tỉ lệ (`contain`). */
  boxHeight: number;
  boxWidth: number;
  svg: string;
  svgHeight: number | null;
  svgWidth: number | null;
}

/**
 * SVG toàn màn phóng to được: chụm hai ngón (tới 4×), chạm đúp để phóng/thu, kéo khi đang phóng để xem chỗ khác.
 *
 * ⚠️ Viết cục bộ vì `ZoomableImage` của bộ chung (`@/shared/ui/media-viewer`) chỉ nhận URI ảnh RASTER (expo-image), còn
 * mockup giáo trình là XML SVG inline. Bản trước dùng `ScrollView maximumZoomScale` — thuộc tính CHỈ có trên iOS: trên
 * Android (máy người học) hình đứng yên, chữ 4px của mockup không đọc được. Số học cử chỉ dùng CHUNG `zoom-math.ts` (có
 * test) để hai trình xem phóng/kéo giống hệt nhau.
 *
 * ⛔ `Animated.View` mang `useAnimatedStyle` KHÔNG mang `className` và phải `cssInterop={false}` (styling-nativewind.md,
 * mẫu `RiseIn.tsx`) — interop toàn cục làm rơi `width`/`height` ⇒ hình co về 0. Người không chụm được vẫn xem trọn hình.
 */
export function ZoomableSvg({ accessibilityLabel, boxHeight, boxWidth, svg, svgHeight, svgWidth }: ZoomableSvgProps) {
  const reduceMotion = useReducedMotion();
  const duration = reduceMotion ? 0 : ZOOM_MS;
  const [zoomed, setZoomed] = useState(false);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const ratio = svgWidth && svgHeight && svgWidth > 0 && svgHeight > 0 ? svgWidth / svgHeight : 1;
  const width = Math.min(boxWidth, boxHeight * ratio);
  const height = width / ratio;

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
        scheduleOnRN(setZoomed, true);
      } else {
        reset();
        scheduleOnRN(setZoomed, false);
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      const next = doubleTapScale(scale.get());
      if (next === 1) reset();
      else {
        scale.set(withTiming(next, { duration }));
        savedScale.set(next);
      }
      scheduleOnRN(setZoomed, next > 1);
    });

  const pan = Gesture.Pan()
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

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: scale.get() }],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, doubleTap, pan)}>
      <View
        accessibilityHint="Chụm hai ngón hoặc chạm đúp để phóng to"
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="image"
        accessible
        className="items-center justify-center overflow-hidden"
        collapsable={false}
        style={{ height: boxHeight, width: boxWidth }}
      >
        <Animated.View cssInterop={false} style={[{ height, width }, style]}>
          <SvgXml height={height} width={width} xml={svg} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

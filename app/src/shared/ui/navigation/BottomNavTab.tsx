import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { MOTION_DURATION, MOTION_EASING, MOTION_SPRING } from '../motion/motion.tokens';
import { usePressScale } from '../motion/usePressScale';

import { bottomNav } from './bottom-nav.styles';
import type { BottomNavItem } from './bottom-nav.types';

/** Co của HỘP ICON khi nhấn — sâu hơn `PRESS_SCALE` (0.97) vì hộp chỉ 24–32dp: co 3% ở cỡ đó mắt không thấy. */
const ICON_PRESS_SCALE = 0.92;
/** Đỉnh "nảy" của icon lúc mục VỪA được chọn: 1 → 1.08 → 1. */
const ICON_POP_SCALE = 1.08;
/** Vòng sáng hiện ra từ 0.6 → 1: thấy nó NỞ ra quanh icon chứ không bật phụt lên. */
const HALO_FROM_SCALE = 0.6;

/**
 * Một mục của `BottomNav` — tách khỏi `BottomNav.tsx` (trần 200 dòng) khi thêm chuyển động.
 *
 * ── Chuyển động ─────────────────────────────────────────────────────────────
 * · Vòng sáng (`halo`) LUÔN được dựng ở mọi mục và chỉ đổi `opacity` + `scale`: chọn ⇒ lò xo `MOTION_SPRING.indicator`
 *   (nảy rất nhẹ), bỏ chọn ⇒ mờ nhanh `MOTION_DURATION.fast`. Bản cũ gắn/gỡ hẳn thẻ nên nó "bật" lên không báo trước.
 * · Icon của mục vừa chọn nảy 1 → 1.08 → 1; hộp icon co 0.92 khi nhấn (`usePressScale`).
 * · ⚠️ Lần dựng ĐẦU đặt sẵn trạng thái cuối (không diễn): mở app thì tab đang mở đã sáng sẵn, không "nở" ra.
 * · ⚠️ "Giảm chuyển động" ⇒ nhảy thẳng tới trạng thái cuối, không nảy, không co.
 */
export function BottomNavTab({
  item,
  onSelect,
  selected,
}: {
  item: BottomNavItem;
  onSelect: (key: string) => void;
  selected: boolean;
}) {
  const styles = bottomNav({ featured: item.featured, selected });
  const unread = item.badge ?? 0;
  // Trên 99 thì ô đỏ không đủ chỗ, nhưng nhãn trợ năng vẫn đọc số THẬT.
  const badgeText = unread > 99 ? '99+' : String(unread);

  const reduceMotion = useReducedMotion();
  const press = usePressScale(ICON_PRESS_SCALE);
  const halo = useSharedValue(selected ? 1 : 0);
  const pop = useSharedValue(1);
  /** Trạng thái đã diễn gần nhất — chặn diễn lại ở lần dựng đầu (và lần chạy effect kép của StrictMode). */
  const shown = useRef(selected);

  useEffect(() => {
    if (shown.current === selected) return;
    shown.current = selected;
    if (reduceMotion) {
      halo.set(selected ? 1 : 0);
      return;
    }
    if (!selected) {
      halo.set(withTiming(0, { duration: MOTION_DURATION.fast, easing: MOTION_EASING.standard }));
      return;
    }
    halo.set(withSpring(1, MOTION_SPRING.indicator));
    pop.set(
      withSequence(
        withTiming(ICON_POP_SCALE, { duration: MOTION_DURATION.fast, easing: MOTION_EASING.standard }),
        withSpring(1, MOTION_SPRING.indicator),
      ),
    );
  }, [halo, pop, reduceMotion, selected]);

  const haloStyle = useAnimatedStyle(() => {
    const progress = halo.get();
    return {
      // ⚠️ Lò xo vượt nhẹ quá 1 (và dưới 0): chặn `opacity` trong [0, 1], còn `scale` cứ để nảy — đó là cái "sống" của chỉ báo.
      opacity: Math.min(Math.max(progress, 0), 1),
      transform: [{ scale: HALO_FROM_SCALE + (1 - HALO_FROM_SCALE) * progress }],
    };
  });
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));

  return (
    <Pressable
      accessibilityHint={item.accessibilityHint}
      /**
       * ⛔ Huy hiệu phải được GỘP vào nhãn.
       *
       * Con số vẽ trong ô đỏ là hình ảnh — trình đọc màn hình không đọc
       * nó (và ở dưới ta còn chủ động giấu ô đó đi để nó không bị đọc
       * tách rời thành "3"). Không gộp thì người dùng khiếm thị hoàn
       * toàn không biết có thông báo chưa đọc.
       */
      accessibilityLabel={unread > 0 ? `${item.label}, ${String(unread)} mục chưa đọc` : item.label}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      /**
       * Phản hồi khi chạm. `borderless` để gợn sóng KHÔNG bị cắt thành
       * một ô chữ nhật đè lên dải màu — mục tab không có nền riêng.
       * (Bản vẽ chỉ có Default/Active nên đây là phần thêm cho cảm giác
       * bấm, không phải yêu cầu thiết kế.)
       */
      android_ripple={{ borderless: true }}
      className={styles.item()}
      onLongPress={item.onLongPress}
      onPress={() => onSelect(item.key)}
      onPressIn={press.pressIn}
      onPressOut={press.pressOut}
    >
      {/* ⛔ Thẻ mang handle `useAnimatedStyle` KHÔNG mang `className` (NativeWind + Reanimated vứt sạch class, hộp
          thành 0×0 — `src/shared/ui/AGENTS.md`): hình của hộp icon nằm ở `View` lồng bên trong. */}
      <Animated.View style={press.scaleStyle}>
        <View className={styles.iconBox()}>
          {/* Khai TRƯỚC icon để nằm dưới. Không nhận chạm (`pointerEvents`). Lớp ngoài chỉ định VỊ TRÍ (`absolute` +
              `inset`), lớp giữa diễn hoạt, lớp trong mang nền tròn. ⚠️ `collapsable={false}`: Android làm phẳng thẻ
              chỉ-có-bố-cục, và thẻ bo tròn bị làm phẳng/dựng lại giữa chừng thì mất `rounded-full` (ca đã đo ở `TabItem`).
              ⛔ Lớp giữa `cssInterop={false}`: thiếu nó NativeWind gộp mảng style, Reanimated bỏ mất `absoluteFill`. */}
          <View className={styles.halo()} pointerEvents="none">
            <Animated.View cssInterop={false} style={[StyleSheet.absoluteFill, haloStyle]}>
              <View className={styles.haloFill()} collapsable={false} />
            </Animated.View>
          </View>
          <Animated.View style={popStyle}>
            {selected ? (item.activeIcon ?? item.icon) : item.icon}
          </Animated.View>
          {unread > 0 ? (
            <View
              /**
               * Giấu khỏi trình đọc màn hình: nội dung của nó đã nằm trong
               * `accessibilityLabel` của cả tab. Để lộ ra thì người dùng
               * nghe "Thông báo" rồi "3" như hai phần tử không liên quan.
               */
              accessibilityElementsHidden
              className={styles.badge()}
              importantForAccessibility="no-hide-descendants"
            >
              {/* ⛔ `maxFontSizeMultiplier`: hộp huy hiệu là `min-h-lg`
                  nên nó NỞ theo chữ — trần này chỉ để nó đừng nở quá ô
                  icon 24dp. Android cho phóng cỡ chữ tới 2×: bỏ trần thì
                  ở mức "Cỡ chữ: Lớn nhất" nhãn 12px thành 24px, huy hiệu
                  cao ~28dp và trùm lên chính biểu tượng bên dưới. Trần
                  1.3 là CÙNG con số và cùng lý do với `Badge.tsx`. ⚠️ Đây
                  là TRẦN chứ không phải hệ số: chữ thường không nhỏ đi. */}
              <Text className={styles.badgeLabel()} maxFontSizeMultiplier={1.3} numberOfLines={1}>
                {badgeText}
              </Text>
            </View>
          ) : null}
        </View>
      </Animated.View>
      <Text className={styles.label()} ellipsizeMode="tail" numberOfLines={1}>
        {item.label}
      </Text>
    </Pressable>
  );
}

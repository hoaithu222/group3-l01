import { type ReactNode } from 'react';
import { type GestureResponderEvent, Pressable, type PressableProps, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { cn } from '@/shared/utils/style/cn';

import { PRESS_SCALE } from './motion.tokens';
import { usePressScale } from './usePressScale';

/** `flexGrow` chứ ⛔ KHÔNG `flex: 1`: cha cao-theo-nội-dung + con `flexBasis: 0` là con sập về 0dp (nội dung tràn ra ngoài). */
const GROW = { flexGrow: 1 } as const;

interface PressState {
  pressed: boolean;
}

export interface PressableScaleProps extends Omit<PressableProps, 'children' | 'style'> {
  children: ReactNode | ((state: PressState) => ReactNode);
  /**
   * Lớp BỐ CỤC của vùng nhận chạm (`flex-1`, `w-1/4`, `self-start`, lề ngoài) — ⛔ KHÔNG đặt nền/bo góc/đệm ở đây: lớp
   * này KHÔNG co lại khi nhấn, nền đặt ở đây đứng yên trong khi nội dung co vào trong nó (trông như lỗi vẽ).
   */
  className?: string;
  /** Lớp NHÌN THẤY (nền, viền, bo góc, đệm) — co cùng nội dung. Nhận hàm để đổi màu lúc nhấn (`pressed`). */
  contentClassName?: string | ((state: PressState) => string);
  /**
   * Cho khối nhìn thấy CAO BẰNG vùng nhận chạm — ô trong hàng lưới cần cao đều nhau (`className="flex-1"` ở từng ô).
   * Mặc định tắt: khối cao theo nội dung.
   */
  fill?: boolean;
  /** Tỉ lệ co khi nhấn — mặc định `PRESS_SCALE` (0.97). Ô nhỏ (≤ 64dp) co mạnh hơn được (0.94) mà vẫn không nhoè chữ. */
  scaleTo?: number;
}

/**
 * Vùng bấm CO NHẸ khi nhấn rồi bật về bằng lò xo — phản hồi "chạm được" cho thẻ, ô lối tắt, ô lưới (thay cho
 * `active:opacity-*` chỉ làm mờ, vốn khó thấy dưới ngón tay).
 *
 * ```tsx
 * <PressableScale
 *   accessibilityLabel="Mở Tin nhắn"
 *   accessibilityRole="button"
 *   className="flex-1"
 *   contentClassName="rounded-md bg-bg-1 p-sm"
 *   fill
 *   onPress={open}
 * >
 *   <IconTile name="chat-bubble" />
 *   <Text className="text-label-md text-fg-1">Tin nhắn</Text>
 * </PressableScale>
 * ```
 *
 * ── Ba tầng, và vì sao ─────────────────────────────────────────────────────────────────────────────────────────
 * `Pressable` (bố cục, nhận chạm) → `Animated.View` (CHỈ `style` co giãn) → `View` (hình thức). Đúng khuôn đã chạy thật
 * trên máy của `AnswerTile`/`Toggle`: ⛔ thẻ mang `useAnimatedStyle` KHÔNG được mang `className` — NativeWind gộp class với
 * handle animation vào một object, Reanimated coi cả object là handle và vứt sạch style của class (khối vô hình, không lỗi).
 *
 * ── Khi nào KHÔNG dùng ─────────────────────────────────────────────────────────────────────────────────────────
 * ⛔ Hàng danh sách dài (`ListItem`, hàng hội thoại): co cả hàng rộng 390dp là "rung" cả màn — hàng dùng nền nhấn.
 * ⛔ `Button`: đã có trạng thái nhấn theo bản vẽ (đổi nền).
 * ✅ Thẻ/ô ĐỘC LẬP có viền bo: thẻ hero Trang chủ, ô phân hệ, thẻ nhóm, thẻ bộ học, ô chọn dạng lưới.
 *
 * ⚠️ "Giảm chuyển động" bật ⇒ không co (chỉ còn đổi màu qua `contentClassName` hàm, nếu nơi gọi có).
 */
export function PressableScale({
  children,
  className,
  contentClassName,
  fill = false,
  scaleTo = PRESS_SCALE,
  onPressIn,
  onPressOut,
  ...pressableProps
}: PressableScaleProps) {
  const { pressIn, pressOut, scaleStyle } = usePressScale(scaleTo);

  const handlePressIn = (event: GestureResponderEvent) => {
    pressIn();
    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    pressOut();
    onPressOut?.(event);
  };

  return (
    <Pressable
      {...pressableProps}
      className={className}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      {(state) => (
        <Animated.View cssInterop={false} style={fill ? [GROW, scaleStyle] : scaleStyle}>
          {/* ⛔ `collapsable={false}`: `contentClassName` dạng hàm hay chỉ có nền LÚC BẤM — Fabric trên Android "làm phẳng"
              View không nền lúc nghỉ, tới lúc có nền thì dựng view thiếu `borderRadius` ⇒ vệt bấm VUÔNG góc
              (`docs/rules/styling-nativewind.md` → "Android làm VUÔNG góc…"). */}
          <View
            className={cn(
              fill && 'grow',
              typeof contentClassName === 'function' ? contentClassName(state) : contentClassName,
            )}
            collapsable={false}
          >
            {typeof children === 'function' ? children(state) : children}
          </View>
        </Animated.View>
      )}
    </Pressable>
  );
}

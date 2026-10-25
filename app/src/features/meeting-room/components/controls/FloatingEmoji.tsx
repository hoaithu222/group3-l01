import { useEffect, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';

import { REACTION_LIFETIME_MS } from '../../constants/meeting-room.constants';
import type { FloatingReaction } from '../../store/meeting-room.store';

/** Bay lên bao nhiêu dp trước khi mờ hẳn. */
const RISE_DP = 200;
/**
 * Cách mép dưới/phải của sân khấu (dp). Lớp phủ nằm TRONG khung sân khấu — thanh điều khiển ở ngoài khung (chỗ của nó được giữ cả khi ẩn,
 * xem `RoomChromeSlot`) ⇒ cảm xúc không bao giờ bay đè lên nút.
 */
const EDGE_DP = 8;

/** Lệch ngang giả-ngẫu-nhiên THEO id (5 nấc) để các cảm xúc gửi dồn không chồng khít nhau — cùng id luôn cùng chỗ (không nhảy khi vẽ lại). */
function driftOf(id: string): number {
  let sum = 0;
  for (const char of id) sum += char.charCodeAt(0);
  return (sum % 5) * 28;
}

export interface FloatingEmojiProps {
  /** Không vẽ nhưng VẪN đếm giờ để tự gỡ khỏi store — chế độ tĩnh chỉ hiện vài cảm xúc gần nhất, số còn lại không được kẹt lại. */
  hidden?: boolean;
  name: string;
  /** Hết `REACTION_LIFETIME_MS` kể từ lúc nhận (`reaction.at`). */
  onDone: (id: string) => void;
  reaction: FloatingReaction;
  /** Giảm chuyển động: KHÔNG bay — hiện tĩnh thành viên thuốc "👍 Lan". */
  still: boolean;
}

/**
 * MỘT cảm xúc bay lên góc dưới phòng (Animated của RN, chạy trên luồng native: chỉ `opacity` + `transform`), hoặc — khi giảm chuyển động —
 * một viên thuốc tĩnh. Tự gọi `onDone(id)` khi hết hạn.
 *
 * ⚠️ Hẹn giờ gỡ tính theo `reaction.at` (mốc tuyệt đối) chứ không phải "3 giây kể từ lúc component mount": vẽ lại/mount lại không làm cảm xúc
 * sống thêm. ⛔ `className` không đi với `Animated.*` — style animation truyền qua `style`, lớp tô màu ở `View` con.
 */
export function FloatingEmoji({ hidden = false, name, onDone, reaction, still }: FloatingEmojiProps) {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const timer = setTimeout(() => onDone(reaction.id), Math.max(0, reaction.at + REACTION_LIFETIME_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [onDone, reaction.at, reaction.id]);

  useEffect(() => {
    if (still) return undefined;
    const animation = Animated.timing(progress, { duration: REACTION_LIFETIME_MS, easing: Easing.out(Easing.quad), toValue: 1, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [progress, still]);

  if (still) {
    return hidden ? null : (
      <View accessibilityLabel={`${name} gửi ${reaction.emoji}`} accessible className="flex-row items-center gap-2xs rounded-full bg-overlay px-sm py-2xs">
        <Text className="text-label-lg">{reaction.emoji}</Text>
        <Text className="text-caption-sm text-fg-on-nav" maxFontSizeMultiplier={1.3} numberOfLines={1}>
          {name}
        </Text>
      </View>
    );
  }

  return (
    <Animated.View
      accessibilityLabel={`${name} gửi ${reaction.emoji}`}
      accessible
      style={{
        bottom: EDGE_DP,
        opacity: progress.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 1, 1, 0] }),
        position: 'absolute',
        right: EDGE_DP + driftOf(reaction.id),
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -RISE_DP] }) }],
      }}
    >
      {/* Bong bóng emoji + bong bóng TÊN người gửi (nền `overlay` tối mờ: đọc được trên mọi khung hình video sáng/tối). */}
      <View className="items-center gap-3xs">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-overlay">
          <Text className="text-header-md" maxFontSizeMultiplier={1.3}>
            {reaction.emoji}
          </Text>
        </View>
        <View className="max-w-32 rounded-full bg-overlay px-xs py-3xs">
          <Text className="text-caption-sm text-fg-on-nav" maxFontSizeMultiplier={1.3} numberOfLines={1}>
            {name}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

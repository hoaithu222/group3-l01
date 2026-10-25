import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { ThemeColorKey } from '@/shared/theme';
import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import { answerLook } from '../utils/answer-identity';
import { AnswerShape } from './AnswerShape';

const FILL = { flex: 1 } as const;
const SELECT_SPRING = { damping: 14, stiffness: 220 } as const;
/** Ô đã chọn phồng nhẹ lên — "sáng lên" bằng chuyển động, ngoài viền đậm + dấu ✓ (không chỉ một kênh). */
const SELECTED_SCALE = 1.03;
/** Đáp án ngắn (từ, số, tên riêng) được in cỡ to hơn — ô lớn mà chữ bé thì trông trống; đáp án dài giữ cỡ dễ đọc nhiều dòng. */
const SHORT_ANSWER_CHARS = 18;

export interface AnswerTileProps {
  index: number;
  text: string;
  className?: string;
  /** Khoá cả bảng nhưng KHÔNG phải ô đã chọn ⇒ mờ đi để ô đã chọn nổi bật. */
  dimmed?: boolean;
  disabled?: boolean;
  /** Đang gửi đáp án lên server — icon đồng hồ thay cho dấu ✓. */
  loading?: boolean;
  /** Xếp một cột (đáp án dài): hình + chữ cái nằm ngang cùng dòng với nội dung thay vì phía trên. */
  row?: boolean;
  selected?: boolean;
  /** Không truyền ⇒ ô CHỈ ĐỂ XEM (màn của chủ phòng). */
  onPress?: () => void;
}

/**
 * Ô đáp án kiểu Kahoot: nền ĐẶC theo bộ nhận diện (màu + hình khối + chữ cái), chạm ≥ 56dp. Vì sao dựng cục bộ mà không dùng
 * `Button`: `Button` chỉ có sáu tông trạng thái, cao cố định 32–56dp, một dòng nhãn — không vẽ được ô cao nhiều dòng với hình
 * khối, viền chọn và trạng thái "đã khoá" của bảng đáp án. Màu là CẶP token `action-*` + `*-fg` đã đo (xem `live-quiz-visuals`).
 *
 * ⛔ `Animated.View` KHÔNG mang `className` (NativeWind + `useAnimatedStyle` làm rơi style): lớp animation chỉ có `style`,
 * phần nhìn thấy là `View` lồng bên trong. Viền LUÔN dày 2dp (trong suốt khi chưa chọn) để chọn xong ô không giật kích thước.
 */
export function AnswerTile({
  className,
  dimmed = false,
  disabled = false,
  index,
  loading = false,
  onPress,
  row = false,
  selected = false,
  text,
}: AnswerTileProps) {
  const look = answerLook(index);
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    const target = selected && !reduceMotion ? SELECTED_SCALE : 1;
    scale.set(reduceMotion ? target : withSpring(target, SELECT_SPRING));
  }, [reduceMotion, scale, selected]);

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const body = (pressed: boolean) => (
    <Animated.View cssInterop={false} style={[FILL, popStyle]}>
      <View
        className={cn(
          'flex-1 rounded-md border-thick',
          look.fill,
          selected ? 'border-border-ink' : 'border-transparent',
          row ? 'min-h-16 flex-row items-center gap-sm px-md py-sm' : 'min-h-28 gap-xs p-sm',
          (dimmed || pressed) && 'opacity-60',
        )}
      >
        <View className={cn('flex-row items-center gap-xs', row ? '' : 'justify-between')}>
          <View className="flex-row items-center gap-xs">
            <AnswerShape color={look.inkToken} shape={look.shape} size={row ? 28 : 24} />
            <Text className={cn('text-header-sm font-bold', look.ink)} maxFontSizeMultiplier={1.3}>
              {look.letter}
            </Text>
          </View>
          {row ? null : <Marker loading={loading} selected={selected} token={look.inkToken} />}
        </View>
        <Text
          className={cn(
            'font-semibold',
            text.length <= SHORT_ANSWER_CHARS ? 'text-header-sm' : 'text-label-lg',
            look.ink,
            row && 'flex-1',
          )}
        >
          {text}
        </Text>
        {row ? <Marker loading={loading} selected={selected} token={look.inkToken} /> : null}
      </View>
    </Animated.View>
  );

  const label = `${look.letter}. ${text}`;

  if (!onPress) {
    return (
      <View accessibilityLabel={label} accessible className={cn('flex-1', className)}>
        {body(false)}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled, selected }}
      className={cn('flex-1', className)}
      disabled={disabled}
      onPress={onPress}
    >
      {({ pressed }) => body(pressed && !disabled)}
    </Pressable>
  );
}

/**
 * Dấu trạng thái ở góc ô: đồng hồ khi đang gửi (không dùng vòng quay trần: ESLint chặn, màu thô của hệ điều hành), ✓ khi đã chọn,
 * còn lại chừa chỗ để ô không giật khi chọn xong.
 */
function Marker({
  loading,
  selected,
  token,
}: {
  loading: boolean;
  selected: boolean;
  token: ThemeColorKey;
}) {
  if (loading) return <Icon color={token} name="clock" size="md" />;
  if (selected) return <Icon color={token} name="checkmark-circle" size="md" variant="solid" />;
  return <View className="size-6" />;
}

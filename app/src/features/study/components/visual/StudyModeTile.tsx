import { Pressable, Text, View } from 'react-native';
import { tv } from 'tailwind-variants';

import { IconTile } from '@/shared/ui/icon-tile';
import type { IconName } from '@/shared/ui/icon';
import { twMergeConfig } from '@/shared/utils/style/cn';

import { STUDY_MODE_META, type StudyModeKey } from '../../constants/study-modes.constants';

const tile = tv(
  {
    slots: {
      // `flex-1`: ô nằm trong một hàng `flex-row flex-wrap` (bọc `EnterView` mang `grow basis-…`) — không có nó ô chỉ ôm chiều cao chữ
      // và hai ô cùng hàng cao thấp lệch nhau khi một bên xuống dòng.
      pressable: 'flex-1',
      root: 'flex-1 rounded-md border-hairline border-border-1 bg-bg-1',
      body: 'shrink gap-3xs',
      title: 'font-semibold text-fg-1',
      description: 'text-fg-2',
    },
    variants: {
      // `compact`: lối tắt ở Trang chủ Học — icon trái, tên phải, ⛔ không mô tả (ô ~140dp ở máy 320dp: chữ mô tả rơi xuống 4–5 dòng).
      // `card`: khối luyện tập ở tổng quan bộ — icon trên, tên + mô tả dưới; ô nào cũng đủ chỗ cho 2–3 dòng.
      layout: {
        card: { root: 'gap-sm p-md', title: 'text-label-lg', description: 'text-caption-lg' },
        compact: {
          root: 'min-h-16 flex-row items-center gap-xs p-sm',
          body: 'flex-1',
          title: 'text-label-md',
          description: 'text-caption-sm',
        },
      },
      // Nhấn: nền chìm một bậc (`bg-3`). Ô khoá: nền `disabled-1` + chữ khoá — hạ bằng NỀN chứ không bằng `opacity` (xem `Card`).
      state: {
        default: {},
        disabled: {
          root: 'bg-disabled-1',
          title: 'text-action-disabled-fg',
          description: 'text-action-disabled-fg',
        },
        pressed: { root: 'bg-bg-3' },
      },
    },
    defaultVariants: { layout: 'card', state: 'default' },
  },
  { twMergeConfig },
);

export interface StudyModeTileProps {
  /** Ô đang bận (vd đang đăng ký ôn): khoá bấm, `accessibilityState.busy`. */
  busy?: boolean;
  /** Đè mô tả của chế độ (vd "Đang đăng ký ôn…" hoặc câu riêng của màn). Ở `compact` chỉ làm gợi ý cho trình đọc màn hình. */
  description?: string;
  disabled?: boolean;
  /** Đè icon của chế độ khi ô là một LỐI RIÊNG của chế độ đó (vd `history` cho "Lịch sử thi thử" — vẫn cùng tông với chế độ Thi thử). */
  icon?: IconName;
  layout?: 'card' | 'compact';
  /** Chế độ học — nguồn DUY NHẤT của tông + icon (`STUDY_MODE_META`), để cùng chế độ luôn cùng màu ở mọi màn. */
  mode: StudyModeKey;
  onPress: () => void;
  /** Đè tên của chế độ khi tên của LỐI khác tên chế độ (vd "Tổ chức thi trực tiếp" — chủ phòng, khác "Thi đấu trực tiếp" — người chơi). */
  title?: string;
}

/**
 * Ô chế độ học: `IconTile` mang màu của chế độ + tên (+ mô tả). Dùng ở lưới lối tắt Trang chủ Học (`compact`) và khối "Luyện tập"
 * của tổng quan bộ (`card`) — hai nơi cùng đọc `STUDY_MODE_META` nên một chế độ luôn cùng màu/icon.
 *
 * ── Vì sao viết cục bộ ─────────────────────────────────────────────────────────────────────────────────────────────
 * Bộ chung có `Card onPress` (tiêu đề chuỗi, không có khe icon dẫn đầu + mô tả gộp một ô trợ năng) và `ListItem` (hàng ngang, kẻ
 * chia — đúng thứ ta đang thay). Ô vuông có icon tông màu + chữ hai tầng là hình dạng riêng của "chế độ học"; nếu phân hệ khác
 * (Thành tích, Cố vấn) cần cùng dáng thì đưa lên `src/shared/ui/`.
 *
 * ⚠️ Màu KHÔNG phải kênh thông tin duy nhất: tên luôn là chữ nhìn thấy được; mô tả đi vào `accessibilityHint` (ở `compact` nó
 * không được vẽ). Vùng chạm ≥ 44dp: `compact` cao tối thiểu 64dp, `card` cao theo nội dung (icon 40 + chữ + đệm 32 > 100dp).
 */
export function StudyModeTile({
  busy = false,
  description,
  disabled = false,
  icon,
  layout = 'card',
  mode,
  onPress,
  title,
}: StudyModeTileProps) {
  const meta = STUDY_MODE_META[mode];
  const text = description ?? meta.description;
  const locked = disabled || busy;
  const label = title ?? meta.label;

  return (
    <Pressable
      accessibilityHint={text}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: locked }}
      className={tile({ layout }).pressable()}
      disabled={locked}
      onPress={onPress}
    >
      {({ pressed }) => {
        const styles = tile({
          layout,
          state: locked ? 'disabled' : pressed ? 'pressed' : 'default',
        });
        return (
          <View className={styles.root()}>
            <IconTile
              name={icon ?? meta.icon}
              size={layout === 'compact' ? 'sm' : 'md'}
              tone={meta.tone}
            />
            <View className={styles.body()}>
              <Text className={styles.title()} numberOfLines={layout === 'compact' ? 3 : 2}>
                {label}
              </Text>
              {layout === 'card' ? (
                <Text className={styles.description()} numberOfLines={3}>
                  {text}
                </Text>
              ) : null}
            </View>
          </View>
        );
      }}
    </Pressable>
  );
}

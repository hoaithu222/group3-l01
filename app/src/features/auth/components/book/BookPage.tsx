import { View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

import { PAGE_COUNT, pageAngle, spineFrame, type BookGeometry } from './book-geometry';

/**
 * Tờ giấy: bo mép NGOÀI (mép gáy vuông — các tờ gặp nhau ở gáy), viền `border-1` để từng tờ tách khỏi tờ dưới khi toả.
 * Hai tông xen kẽ: sáng thì gần như trùng (viền lo phần tách), tối thì `bg-2` nổi hẳn khỏi `bg-1` — dải tờ đọc ra từng lớp.
 */
const page = tv(
  {
    slots: {
      sheet: 'overflow-hidden rounded-r-3xs border-hairline border-border-1',
      // `items-end`: tờ trên cùng dừng ở 120° ⇒ thứ ĐỨNG LÂU trên màn là LƯNG tờ (ảnh gương qua gáy). Dòng ngắn canh về mép
      // tự do (phải, toạ độ của tờ) thì lật sang trái nó canh về mép NGOÀI — đọc như chữ trái → phải của trang chẵn thật.
      lines: 'flex-1 items-end justify-center gap-2xs px-xs',
      line: 'h-1 rounded-full bg-border-1',
    },
    variants: {
      tone: { even: { sheet: 'bg-bg-1' }, odd: { sheet: 'bg-bg-2' } },
      compact: { true: { lines: 'gap-3xs px-2xs', line: 'h-0.5' } },
    },
  },
  { twMergeConfig },
);

/** Bề rộng các dòng chữ giả trên tờ trên cùng — dòng cuối ngắn như đoạn văn thật. */
const LINE_WIDTHS = ['w-full', 'w-full', 'w-5/6', 'w-full', 'w-1/2'] as const;

export interface BookPageProps {
  compact: boolean;
  geometry: BookGeometry;
  /** 0 = tờ sát bìa (lật trước, nằm dưới cùng khi đã sang trái) … `PAGE_COUNT − 1` = tờ trên cùng khi mở. */
  index: number;
  progress: SharedValue<number>;
}

/**
 * Một tờ ruột sách. Xoay `rotateY(−θᵢ)` quanh gáy, θᵢ = góc đích của tờ × `progress` (toả theo không gian — flutterfx).
 * Hai mặt của tờ trắng trông như nhau nên KHÔNG cần mặt thứ hai: quá 90° thấy lưng tờ (ảnh gương qua gáy) là đúng.
 *
 * ⛔ `Animated.View` mang `useAnimatedStyle` KHÔNG mang `className` và phải `cssInterop={false}` (styling-nativewind.md
 * "Cạm bẫy") — màu/viền nằm ở `View` con. `collapsable={false}`: Fabric không được "làm phẳng" khung chỉ có transform.
 */
export function BookPage({ compact, geometry, index, progress }: BookPageProps) {
  const { pageH, pageW, perspective } = geometry;
  const styles = page({ compact, tone: index % 2 === 0 ? 'even' : 'odd' });
  // Chỉ tờ TRÊN CÙNG có dòng chữ giả: khi mở nó phủ nửa trái gần 1/2 bề ngang — các tờ dưới chỉ lộ một dải mép.
  const topmost = index === PAGE_COUNT - 1;

  const style = useAnimatedStyle(() => ({
    transform: [{ perspective }, { rotateY: `${-pageAngle(progress.get(), index)}deg` }],
  }));

  return (
    <Animated.View
      collapsable={false}
      cssInterop={false}
      style={[spineFrame(pageW, pageH, geometry), style]}
    >
      {/* Nửa PHẢI của khung 2W (`left = pageW`), nửa trái để trống — xem "Tâm xoay" ở `book-geometry.ts`. */}
      <View
        className={styles.sheet()}
        style={{ height: pageH, left: pageW, position: 'absolute', top: 0, width: pageW }}
      >
        {topmost ? (
          <View className={styles.lines()}>
            {LINE_WIDTHS.map((width, line) => (
              <View key={line} className={styles.line({ className: width })} />
            ))}
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

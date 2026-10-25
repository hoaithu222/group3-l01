import { View } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

import { SliderDotItem } from './SliderDotItem';

/** Figma: chấm 4dp, viên thuốc 12dp, cách nhau 4dp. Khoảng cách = đúng một cỡ chấm. */
const DEFAULT_DOT_SIZE = 4;

/** Figma "Slide = default": tối đa 4 chấm đủ cỡ, nhiều hơn thì thu về cửa sổ trượt. */
const MAX_FULL_DOTS = 4;

/** Figma: chấm "còn nữa" ở hai đầu chỉ 2dp = nửa chấm thường. */
const MORE_DOT_RATIO = 0.5;

interface DotWindow {
  hasLeftMore: boolean;
  hasRightMore: boolean;
  length: number;
  start: number;
}

/**
 * Cửa sổ trượt, dựng lại từ ba trạng thái Figma vẽ sẵn ở `Slide = ">4"`:
 *   · `Scroll = Default` → 4 chấm + 1 chấm nhỏ bên phải  (rộng 42dp)
 *   · `Scroll = End`     → 1 chấm nhỏ bên trái + 4 chấm  (rộng 42dp)
 *   · `Scroll = Center`  → nhỏ + 3 chấm + nhỏ            (rộng 40dp)
 * Quy tắc rút ra: LUÔN 5 ô, ô nào rơi vào phía còn trang bị giấu thì thành chấm
 * nhỏ. Nhờ vậy bề rộng hàng gần như không đổi khi lật trang — hàng chấm không
 * "co giật" ở giữa màn hình.
 */
function getDotWindow(count: number, active: number): DotWindow {
  if (count <= MAX_FULL_DOTS) {
    return { hasLeftMore: false, hasRightMore: false, length: count, start: 0 };
  }
  if (active <= 1) {
    return { hasLeftMore: false, hasRightMore: true, length: MAX_FULL_DOTS, start: 0 };
  }
  if (active >= count - 2) {
    return {
      hasLeftMore: true,
      hasRightMore: false,
      length: MAX_FULL_DOTS,
      start: count - MAX_FULL_DOTS,
    };
  }
  return { hasLeftMore: true, hasRightMore: true, length: MAX_FULL_DOTS - 1, start: active - 1 };
}

export interface SliderDotProps {
  activeIndex: number;
  className?: string;
  count: number;
  /** Có truyền thì mỗi chấm bấm được. Không truyền thì cả hàng chỉ để nhìn. */
  onPressDot?: (index: number) => void;
  /** Đường kính chấm thường, dp. Mặc định 4 = số của Figma; viên thuốc và
   *  khoảng cách suy ra theo tỉ lệ nên đổi một số là cả hàng vẫn cân. */
  size?: number;
}

/**
 * Hàng chấm chỉ trang của carousel.
 *
 * Số đo lấy từ Figma "BIDV OMNI MB / Slider dot" (`259:97091`).
 *
 * ⚠️ Component này chỉ VẼ trạng thái, không tự đổi trang. Trang hiện tại là của
 * carousel — truyền xuống qua `activeIndex`. Để nó tự giữ state là có hai nguồn
 * sự thật, và chúng lệch nhau ngay lần đầu người dùng vuốt nửa chừng rồi thả.
 *
 * ⚠️ Figma chỉ vẽ bốn ảnh tĩnh nên không nói cửa sổ trượt phải đặt chấm đang
 * chọn ở đâu khi cả hai đầu đều còn trang bị giấu. Ở đây chọn ĐẶT GIỮA — chấm
 * đang chọn luôn có một chấm hai bên, nên hướng vuốt nào cũng thấy trước được
 * là còn trang. (Ảnh Figma "Center" vẽ nó ở ô đầu, nhưng một ảnh tĩnh không đủ
 * để suy ra quy tắc.)
 */
export function SliderDot({
  activeIndex,
  className,
  count,
  onPressDot,
  size = DEFAULT_DOT_SIZE,
}: SliderDotProps) {
  const total = Math.max(0, Math.trunc(count));

  // Một trang thì không có gì để chỉ, và một chấm đơn độc trông như lỗi hiển thị.
  if (total <= 1) return null;

  const active = Math.min(Math.max(Math.trunc(activeIndex), 0), total - 1);
  const dots = getDotWindow(total, active);
  const pages = Array.from({ length: dots.length }, (_, offset) => dots.start + offset);
  const moreDot = (
    <View
      className="rounded-full bg-border-2"
      style={{ height: size * MORE_DOT_RATIO, width: size * MORE_DOT_RATIO }}
    />
  );

  return (
    <View
      /**
       * Hai chế độ trợ năng khác hẳn nhau, đừng gộp:
       *
       * · CHỈ NHÌN → gộp cả hàng thành MỘT phần tử với nhãn "Trang 2 trên 5".
       *   Để nguyên thì trình đọc màn hình đọc 5 chấm rời rạc, mỗi chấm một lần
       *   vuốt, và không chấm nào nói được nó là chấm thứ mấy.
       * · BẤM ĐƯỢC → `tablist` + `tab`, vì lúc này chúng là điều khiển thật.
       *   ⛔ Không đặt `accessible` cho hàng ở chế độ này: nó nuốt luôn các
       *   `tab` con và người dùng khiếm thị hết đường bấm.
       */
      accessibilityLabel={onPressDot ? undefined : `Trang ${active + 1} trên ${total}`}
      accessibilityRole={onPressDot ? 'tablist' : undefined}
      accessible={onPressDot ? undefined : true}
      className={cn('flex-row items-center', className)}
      // Khoảng cách ăn theo `size` nên không có class Tailwind cố định nào thay được.
      style={{ gap: size }}
    >
      {dots.hasLeftMore ? moreDot : null}
      {pages.map((page) => (
        <SliderDotItem
          key={page}
          active={page === active}
          label={`Trang ${page + 1} trên ${total}`}
          size={size}
          onPress={onPressDot ? () => onPressDot(page) : undefined}
        />
      ))}
      {dots.hasRightMore ? moreDot : null}
    </View>
  );
}

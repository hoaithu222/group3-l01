import { Modal, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

import { type TooltipGeometry } from './tooltip-geometry.utils';
import { TOOLTIP_ARROW_SIZE } from './tooltip.constants';

/**
 * Lớp phủ của `<Tooltip>`: nền bắt cú chạm ra ngoài + mũi nhọn + bong bóng.
 *
 * Tách khỏi `Tooltip.tsx` để file kia không vượt trần 200 dòng
 * (`src/shared/ui/AGENTS.md`). ⛔ Không export ra barrel: dựng bong bóng mà
 * quên `<Modal>` là mở đường cho `overflow: hidden` của thẻ cha cắt cụt nó.
 *
 * ── Ba cạm bẫy đã gói sẵn ở đây ──────────────────────────────────────────────
 * 1. Bong bóng vẽ trong `<Modal transparent>` chứ không vẽ tại chỗ. Vẽ tại chỗ
 *    thì `overflow: hidden` của `ScrollView`/thẻ bo góc cắt cụt nó — lỗi CHẮC
 *    CHẮN xảy ra, chỉ là xảy ra ở màn nào thôi.
 * 2. `statusBarTranslucent` phải bật. Thiếu nó, trên Android modal bắt đầu ngay
 *    DƯỚI thanh trạng thái trong khi `measureInWindow` đo theo cả màn hình —
 *    bong bóng lệch xuống đúng bằng chiều cao thanh trạng thái, và chỉ lệch
 *    trên Android nên rất dễ nghiệm thu sót.
 * 3. `supportedOrientations` phải khai, nếu không iPhone khoá CẢ APP ở portrait
 *    suốt lúc modal mở (ESLint của repo cũng chặn cứng).
 */
const tooltipBubble = tv(
  {
    slots: {
      /**
       * Mũi nhọn = hình vuông XOAY 45°, không phải SVG. `fill` của
       * `react-native-svg` chỉ nhận màu thô nên phải lấy qua `useThemeColors()`
       * rồi tự giữ cho khớp nền bong bóng — đổi token màu một lần là mũi nhọn
       * lệch tông mà không ai để ý. Hình vuông xoay dùng CHUNG một class nền với
       * bong bóng nên không bao giờ lệch được.
       */
      arrow: 'absolute bg-bg-tooltip',
      /**
       * Figma: bo 16 (`rounded-sm`), padding 12 (`p-sm`).
       *
       * ⛔ `bg-tooltip` chứ KHÔNG phải `action-base`: Figma có biến RIÊNG
       * `BgTooltip` = #003730 cho bong bóng, khác màu nút `#00453C`. Mượn token
       * của NÚT thì hôm nào ngân hàng đổi màu nút là tooltip đổi theo dù bản
       * thiết kế không hề nói vậy.
       * ⛔ Cũng không phải `primary-6`: thang `primary-*` giống hệt nhau ở hai
       * chế độ ⇒ chế độ tối là bong bóng gần đen trên nền gần đen.
       */
      bubble: 'absolute rounded-sm bg-bg-tooltip p-sm',
      /**
       * ⛔ `fg-on-tooltip` — cặp ĐI KÈM `bg-tooltip`, không phải `white-10` cũng
       * không phải `fg-inverse`. Nền bong bóng ĐẢO theo chế độ (xanh rất đậm ở
       * chế độ sáng, xanh nhạt ở chế độ tối) nên chữ phải đảo cùng: chữ trắng
       * cứng trên bong bóng sáng màu của chế độ tối chỉ còn 1.21:1, đọc không nổi.
       */
      label: 'text-body-md text-fg-on-tooltip',
    },
  },
  { twMergeConfig },
);

export function TooltipBubble({
  content,
  geometry,
  maxWidth,
  minWidth,
  visible,
  onBubbleLayout,
  onClose,
}: {
  content: string;
  /** `null` ở nhịp vẽ đầu — chưa đo xong bong bóng thì chưa biết đặt vào đâu. */
  geometry: TooltipGeometry | null;
  maxWidth: number;
  minWidth: number;
  visible: boolean;
  onBubbleLayout: (event: LayoutChangeEvent) => void;
  onClose: () => void;
}) {
  const styles = tooltipBubble();

  return (
    <Modal
      animationType="fade"
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      {/**
       * `accessibilityViewIsModal` để VoiceOver trên iOS chỉ đọc lớp phủ, không
       * đọc lẫn màn hình phía sau — nếu không, người dùng vuốt tiếp là lạc ra
       * ngoài tooltip mà không biết mình đang ở đâu.
       */}
      <View accessibilityViewIsModal className="flex-1">
        <Pressable
          accessibilityLabel="Đóng chú thích"
          accessibilityRole="button"
          className="absolute inset-0"
          onPress={onClose}
        />

        {geometry ? (
          <View
            className={styles.arrow()}
            pointerEvents="none"
            style={{
              height: TOOLTIP_ARROW_SIZE,
              left: geometry.arrowLeft,
              top: geometry.arrowTop,
              transform: [{ rotate: '45deg' }],
              width: TOOLTIP_ARROW_SIZE,
            }}
          />
        ) : null}

        <View
          className={styles.bubble()}
          /**
           * ⚠️ Hai nhịp vẽ, cố ý: nhịp một đo bong bóng với `opacity: 0`, nhịp
           * hai mới đặt vào chỗ đã tính — chiều cao phụ thuộc chỗ chữ xuống
           * dòng nên không biết trước được. min/max width để ở `style` vì còn
           * phải kẹp theo bề rộng máy thật, số cứng 343 sẽ tràn ở máy 320dp.
           */
          style={{
            left: geometry?.left ?? 0,
            maxWidth,
            minWidth,
            opacity: geometry ? 1 : 0,
            top: geometry?.top ?? 0,
          }}
          onLayout={onBubbleLayout}
        >
          {/**
           * `accessibilityLiveRegion` để TalkBack đọc nội dung ngay khi bong
           * bóng hiện. Thiếu nó, trên Android tooltip xuất hiện hoàn toàn im
           * lặng và người dùng khiếm thị không biết có gì vừa mở ra.
           */}
          <Text accessibilityLiveRegion="polite" className={styles.label()}>
            {content}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

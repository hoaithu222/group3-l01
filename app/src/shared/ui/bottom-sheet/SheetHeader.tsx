import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { GestureDetector, type PanGesture } from 'react-native-gesture-handler';
import { tv } from 'tailwind-variants';

import { Icon } from '@/shared/ui/icon';
import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Phần đầu tấm trượt: thanh kéo + tiêu đề + ba khối phụ đứng yên.
 *
 * ⛔ Vùng bắt cử chỉ vuốt CHỈ là thanh kéo + hàng tiêu đề (`grab`), không phải
 * cả header. Hai lý do:
 *   · bọc cả tấm thì cú vuốt dọc trong danh sách bên trong bị tranh mất;
 *   · bọc cả header thì ô tìm kiếm nằm trong vùng pan — kéo để bôi đen chữ
 *     trong ô nhập biến thành kéo cả tấm xuống.
 * Vì vậy `GestureDetector` nằm ở ĐÂY chứ không ở `BottomSheet`.
 *
 * ── Số đo Figma (`header bottom sheet` 259:95388) ────────────────────────────
 *   · thanh kéo 36×4, bo tròn, cách mép trên 8, cách phần dưới 12
 *     ⇒ nội dung luôn bắt đầu ở 24dp, giống hệt bản không có thanh kéo
 *   · tiêu đề 18/24 semibold, đệm ngang 16, cách nút đóng 16
 *   · `Support text` cao 24, cách tiêu đề 16 · `search bar` 48, cách 16 ·
 *     `Alert` 72, cách 16 ⇒ ba khối cùng một khe `pt-md`
 *   · biểu tượng đóng 24dp — ghi chú thiết kế: "Vùng chạm của icon Close và
 *     Back là 48px" ⇒ `hitSlop={12}`
 *
 * ⚠️ Figma vẽ ba khối phụ rộng 311 (tức thụt thêm 16 so với hàng tiêu đề 343).
 * Ở đây dùng CHUNG `px-4` với hàng tiêu đề: thụt lệch nhau giữa tiêu đề và ô
 * tìm kiếm ngay dưới nó là thứ mắt bắt ra ngay, còn 16dp kia không có ghi chú
 * thiết kế nào giải thích.
 */
const sheetHeader = tv(
  {
    slots: {
      root: 'w-full',
      /** Vùng đặt ngón tay để vuốt — xem ghi chú ⛔ ở trên. */
      grab: 'w-full pt-xl',
      // ⛔ Không dùng token `divider-1` (quá nhạt trên nền trắng của tấm):
      // thanh kéo là dấu hiệu DUY NHẤT báo tấm này kéo được.
      handle: 'mb-sm h-1 w-9 self-center rounded-full bg-divider-2',
      row: 'w-full flex-row items-start gap-md px-4',
      /**
       * Ô 24dp bọc biểu tượng ✕ — chỉ tồn tại để có chỗ tô lớp phản hồi lúc
       * nhấn. ⚠️ Cùng cỡ với biểu tượng nên bố cục KHÔNG đổi một dp nào; vùng
       * chạm vẫn là 48dp do `hitSlop={12}` lo.
       */
      closeButton: 'size-xl items-center justify-center rounded-full',
      title: 'flex-1 text-header-sm font-semibold text-fg-1',
      description: 'px-4 pt-md text-body-md text-fg-2',
      /** Khung của `search bar` / `Alert` — chỉ lo khe và đệm ngang. */
      slot: 'px-4 pt-md',
    },
    variants: {
      /** Có thanh kéo thì đệm trên là 8 (8 + 4 + 12 = 24), không thì thẳng 24. */
      withHandle: {
        true: { grab: 'pt-xs' },
      },
      /**
       * ⛔ Nút ✕ PHẢI có phản hồi lúc nhấn.
       *
       * Đây là đường thoát chính của tấm trượt. Không đổi gì trong ~150ms từ
       * lúc ngón tay chạm tới lúc tấm bắt đầu trượt xuống, người dùng kết luận
       * "bấm không ăn" và bấm thêm vài lần nữa — trên máy chậm là mở/đóng chồng
       * chéo. `action-tint` là cùng lớp nền nhấn mà `CalendarDay` và
       * `CalendarUnitPicker` đang dùng, nên cả bộ component phản hồi giống nhau.
       */
      pressed: {
        true: { closeButton: 'bg-action-tint' },
      },
    },
    defaultVariants: { withHandle: false, pressed: false },
  },
  { twMergeConfig },
);

export function SheetHeader({
  alert,
  description,
  gesture,
  search,
  showHandle,
  title,
  onClose,
}: {
  /** Khối `Alert` của Figma — đứng yên, KHÔNG cuộn theo nội dung. */
  alert?: ReactNode;
  /** `Support text` của Figma: một dòng mô tả ngay dưới tiêu đề. */
  description?: string;
  gesture: PanGesture;
  onClose: () => void;
  /** `search bar` của Figma — đứng yên, KHÔNG cuộn theo danh sách bên dưới. */
  search?: ReactNode;
  showHandle: boolean;
  title?: string;
}) {
  const styles = sheetHeader({ withHandle: showHandle });

  return (
    <View className={styles.root()}>
      <GestureDetector gesture={gesture}>
        <View className={styles.grab()}>
          {showHandle ? (
            /* Thuần trang trí — trình đọc màn hình phải bỏ qua, nút đóng bên dưới
               mới là đường thoát của người dùng khiếm thị. */
            <View
              accessibilityElementsHidden
              className={styles.handle()}
              importantForAccessibility="no-hide-descendants"
            />
          ) : null}

          {title ? (
            <View className={styles.row()}>
              <Text accessibilityRole="header" className={styles.title()}>
                {title}
              </Text>

              <Pressable
                accessibilityLabel="Đóng"
                accessibilityRole="button"
                /* 24dp hình vẽ + 12dp mỗi bên = 48dp vùng chạm, đúng ghi chú thiết kế. */
                hitSlop={12}
                onPress={onClose}
              >
                {/* ⛔ `pressed` lấy ở CHILDREN, không đặt hàm vào `className` —
                    NativeWind chỉ nhận chuỗi ở `className` và hàm là `tsc` đỏ. */}
                {/* ⛔ `collapsable={false}`: vòng nút đóng chỉ có nền LÚC BẤM — thiếu cờ này Android dựng view không kèm
                    `rounded-full` ⇒ vệt bấm vuông (`docs/rules/styling-nativewind.md` → "Cạm bẫy"). */}
                {({ pressed }) => (
                  <View className={sheetHeader({ pressed }).closeButton()} collapsable={false}>
                    {/* Figma render `icon_ht_cancel` thành vòng tròn TÔ + dấu ✕ đặc,
                        kèm biến `Opacity/Ink/Op20` — đúng nét `bulk` (vòng tròn
                        `fill-opacity="0.2"`). Nét `linear` mặc định làm nút thoát
                        chính của tấm gần như chìm vào nền trắng.
                        ⚠️ Màu `fg-1` chứ không phải `fg-2`: 20% của `fg-1` (#1A1A1A)
                        ra đúng `#1a1a1a33` mà Figma bind cho vòng tròn. */}
                    <Icon color="fg-1" name="cancel" variant="bulk" />
                  </View>
                )}
              </Pressable>
            </View>
          ) : null}
        </View>
      </GestureDetector>

      {description ? <Text className={styles.description()}>{description}</Text> : null}
      {search ? <View className={styles.slot()}>{search}</View> : null}
      {alert ? <View className={styles.slot()}>{alert}</View> : null}
    </View>
  );
}

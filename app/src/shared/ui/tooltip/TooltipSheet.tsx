import { type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SPACING, useBreakpoint } from '@/shared/theme';
import { Icon } from '@/shared/ui/icon';

import { useSheetEdgeInset } from '../bottom-sheet/useSheetEdgeInset';
import { useSheetTransition } from '../bottom-sheet/useSheetTransition';
import { TOOLTIP_SHEET_MAX_HEIGHT_RATIO, TOOLTIP_SHEET_MIN_HEIGHT } from './tooltip.constants';
import { tooltipSheet } from './tooltip-sheet.styles';

/**
 * Tấm trượt từ đáy cho CẤP 3 của thiết kế.
 *
 * Ghi chú thiết kế: "Nội dung > 5 dòng: Sử dụng bottom sheet". Lý do không phải
 * thẩm mỹ — một bong bóng 6–7 dòng che gần hết phần tử mà nó đang giải thích,
 * và không cuộn được nên câu cuối bị cắt trên máy màn nhỏ.
 *
 * ⚠️ Component này KHÔNG tự quyết khi nào hiện. Nơi gọi chạy
 * `resolveTooltipLevel(content) === 3` rồi tự mở — vì chỉ nơi gọi mới có tiêu đề
 * cho sheet, thứ mà bong bóng không cần còn sheet thì bắt buộc phải có.
 *
 * ⚠️ Trùng lặp ĐÃ BIẾT với `BottomSheet` (Figma xác nhận node `259:97797` chính
 * là một instance của `content BT/has description text & button`). Lần này CHỈ
 * dùng chung `useSheetTransition`; gộp hẳn hai component là đổi API lớn, để lại
 * thành nợ kỹ thuật.
 */

/** `GestureHandlerRootView` là component ngoài NativeWind ⇒ chỉ nhận `style`. */
const FILL = { flex: 1 } as const;

export interface TooltipSheetProps {
  /** Danh sách gạch đầu dòng như trong thiết kế. Dùng cùng lúc với `children` được. */
  bullets?: readonly string[];
  /** Nội dung tự do, đặt sau danh sách gạch đầu dòng. */
  children?: ReactNode;
  /**
   * Lớp bổ sung cho chính tấm sheet — đúng node giữ trần 720dp (`tablet:max-w-content`), nên
   * `className="tablet:max-w-none"` đè được thật. ⛔ Trước đây KHÔNG có prop này: sheet cần rộng hơn
   * trên máy tính bảng (bảng biểu, ảnh minh hoạ) không có đường nào đè và không lỗi nào báo.
   */
  className?: string;
  /** Thay biểu tượng ✕ mặc định (`Icon name="cancel"`) khi nơi gọi cần hình khác. */
  closeIcon?: ReactNode;
  onClose: () => void;
  title: string;
  visible: boolean;
}

export function TooltipSheet({
  bullets,
  children,
  className,
  closeIcon,
  title,
  visible,
  onClose,
}: TooltipSheetProps) {
  const styles = tooltipSheet();
  const insets = useSafeAreaInsets();
  /* ⛔ Hook, KHÔNG phải `Dimensions.get()` (đọc một lần rồi thôi): xoay máy lúc sheet đang mở thì trần chiều cao
     kẹt ở số đo cũ. `useBreakpoint` bọc `useWindowDimensions` nên vẽ lại đúng lúc. */
  const { height: windowHeight } = useBreakpoint();
  /* Đệm ngang dùng chung công thức với `BottomSheet` — xem `useSheetEdgeInset`. */
  const edgeInset = useSheetEdgeInset();
  const { animatedStyle, backdropStyle, onSheetLayout, panGesture, requestClose } =
    useSheetTransition(visible, onClose);

  return (
    <Modal
      /* ⛔ KHÔNG `animationType="slide"`: React Native trượt TOÀN BỘ cây con của
         modal, kể cả nền mờ — lớp phủ tối chạy từ đáy màn lên thay vì mờ dần
         tại chỗ, và trong ~300ms đầu nửa trên màn hình không hề tối. Nền mờ phải
         ĐỨNG YÊN, chỉ tấm trượt; vị trí tấm do Reanimated giữ, giống `BottomSheet`. */
      animationType="none"
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
      transparent
      visible={visible}
      onRequestClose={requestClose}
    >
      {/* ⛔ `GestureHandlerRootView` PHẢI có ở đây, dù `AppProviders` đã bọc gốc
          app: `<Modal>` dựng một CỬA SỔ NATIVE RIÊNG, cây con của nó không nằm
          dưới root view của gesture-handler. Thiếu lớp này thì cử chỉ vuốt chết
          trên Android — im lặng, không exception nào. ⚠️ `flex: 1` bắt buộc. */}
      <GestureHandlerRootView style={FILL}>
        <View accessibilityViewIsModal className="flex-1 justify-end">
          {/* Nền mờ `overlay` (token ĐÃ pha alpha — ⛔ đừng `bg-black/50`), độ mờ đi theo tấm như `BottomSheet`.
              ⛔ `cssInterop={false}`: thiếu nó NativeWind gộp mảng style, Reanimated bỏ mất `absoluteFill`. */}
          <Animated.View cssInterop={false} style={[StyleSheet.absoluteFill, backdropStyle]}>
            <Pressable
              accessibilityLabel="Đóng"
              accessibilityRole="button"
              className={styles.backdrop()}
              onPress={requestClose}
            />
          </Animated.View>

          {/* ⛔ `className` KHÔNG đặt lên `Animated.View` — NativeWind gộp class
              vào cùng object với `style`, Reanimated thấy `viewDescriptors` liền
              vứt sạch style đến từ class và tấm thành vô hình. */}
          <Animated.View style={animatedStyle}>
            <View
              className={styles.root({ className })}
              style={{
                maxHeight: windowHeight * TOOLTIP_SHEET_MAX_HEIGHT_RATIO,
                minHeight: TOOLTIP_SHEET_MIN_HEIGHT,
                /**
                 * Thiết kế chừa 21dp cho thanh vuốt của iPhone X. ⛔ Đừng chép số
                 * đó: máy Android ba nút cần nhiều hơn, máy không có thanh nào thì
                 * thừa một dải trống. `insets.bottom` là số đo LÚC CHẠY của đúng
                 * máy đang cầm.
                 */
                paddingBottom: insets.bottom + SPACING.md,
                /**
                 * ⛔ Vùng an toàn NGANG: xoay ngang thì tai thỏ (~44dp) ăn qua
                 * cả đệm `px-md` (16dp) của hàng tiêu đề — chữ đầu dòng chui
                 * xuống dưới nó, nút ✕ sát mép bấm không ăn. ⚠️ Chỉ trừ phần LỀ
                 * THẬT mà trần 720dp đã chừa, ⛔ không cắt theo bậc `isTablet`
                 * (740dp thì lề chỉ 10dp) — xem `useSheetEdgeInset`.
                 * ⚠️ Đặt ở LỚP SHEET (nơi có nền `bg-bg-popup`) để nền vẫn chạy
                 * hết bề ngang, chỉ chữ và nút thụt vào.
                 */
                paddingLeft: edgeInset.left,
                paddingRight: edgeInset.right,
              }}
              onLayout={onSheetLayout}
            >
              <GestureDetector gesture={panGesture}>
                <View className={styles.grab()}>
                  {/**
                   * Tay nắm. Figma KHÔNG vẽ phần tử này (bản thiết kế mượn thanh
                   * vuốt của iPhone làm mốc thị giác) — giữ lại vì trên Android
                   * không có thanh đó. ⚠️ Nó nay là lời hứa CÓ THẬT: cả khối này
                   * nằm trong `GestureDetector` nên kéo xuống là tấm đi theo ngón
                   * tay rồi đóng. Trình đọc màn hình vẫn bỏ qua: thuần trang trí.
                   */}
                  <View
                    accessibilityElementsHidden
                    className={styles.grabber()}
                    importantForAccessibility="no-hide-descendants"
                  />

                  <View className={styles.header()}>
                    <Text accessibilityRole="header" className={styles.title()}>
                      {title}
                    </Text>
                    {/* Biểu tượng ✕ chỉ 24dp: `hitSlop` nới vùng chạm lên 48dp —
                        thiếu nó thì nút đóng của tấm là chỗ bấm trượt nhiều nhất. */}
                    <Pressable
                      accessibilityLabel="Đóng"
                      accessibilityRole="button"
                      hitSlop={12}
                      onPress={requestClose}
                    >
                      {/* ⛔ `pressed` lấy ở CHILDREN — `className` của NativeWind
                          chỉ nhận CHUỖI, đặt hàm vào đó là `tsc` đỏ. */}
                      {({ pressed }) => (
                        // ⛔ Nền chỉ có LÚC BẤM ⇒ thiếu cờ này Android vẽ vệt bấm vuông (xem `SheetHeader`).
                        <View
                          className={tooltipSheet({ pressed }).closeButton()}
                          collapsable={false}
                        >
                          {/* ⚠️ Tên icon là `cancel` — bộ này không có `close`.
                              Nét `bulk` đúng hình Figma render cho
                              `icon_ht_cancel`; `linear` thì chìm vào nền. */}
                          {closeIcon ?? (
                            <Icon color="fg-on-popup" name="cancel" size="md" variant="bulk" />
                          )}
                        </View>
                      )}
                    </Pressable>
                  </View>
                </View>
              </GestureDetector>

              <ScrollView
                className={styles.body()}
                contentContainerClassName="gap-xs px-md pb-md pt-md"
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
              >
                {bullets?.map((item, index) => (
                  <View key={`${index}-${item}`} className="flex-row gap-xs">
                    <View className={styles.dot()} />
                    <Text className={styles.bullet()}>{item}</Text>
                  </View>
                ))}
                {children}
              </ScrollView>
            </View>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

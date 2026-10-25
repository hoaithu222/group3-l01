import { type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SPACING, useBreakpoint } from '@/shared/theme';

import { type bottomSheet, SHEET_MAX_HEIGHT_RATIO, sheetMinHeight } from './bottom-sheet.styles';
import { SheetKeyboardHandledProvider } from './sheet-keyboard-context';
import { SheetHeader } from './SheetHeader';
import { useSheetEdgeInset } from './useSheetEdgeInset';
import { type useSheetTransition } from './useSheetTransition';

/**
 * Bản thân TẤM: lớp né bàn phím → lớp giữ vị trí → mặt tấm (đầu, thân, đáy).
 *
 * Tách khỏi `BottomSheet.tsx` vì file kia vượt trần 200 dòng
 * (`docs/rules/code-style.md`). Ranh giới đặt đúng chỗ này chứ không phải chỗ
 * khác: `BottomSheet` giữ phần thuộc về `<Modal>` (cửa sổ native, nền mờ, phím
 * back, xoay màn), file này giữ phần HÌNH HỌC của tấm — chiều cao, vùng an
 * toàn, né bàn phím. Ba hook đo đạc (`useSafeAreaInsets`, `useBreakpoint`,
 * `useSheetEdgeInset`) chỉ phục vụ phần đó nên đi theo về đây, và `BottomSheet`
 * không còn phải chuyền số đo xuống.
 *
 * ⛔ KHÔNG export ra barrel của nhóm: dựng tấm mà thiếu `<Modal>` bọc ngoài là
 * mất `supportedOrientations` (iPhone khoá portrait) và mất `onRequestClose`
 * (nút back cứng của Android không làm gì).
 */
export interface SheetSurfaceProps {
  alert?: ReactNode;
  bodyClassName?: string;
  children: ReactNode;
  className?: string;
  description?: string;
  footer?: ReactNode;
  height?: number;
  minHeight?: number;
  padded: boolean;
  scrollable: boolean;
  search?: ReactNode;
  /** ĐÃ suy sẵn ở `BottomSheet` từ `showHandle ?? !title` — xem ghi chú ở đó. */
  showHandle: boolean;
  snapToContent: boolean;
  /** Công thức đã tính sẵn của `BottomSheet` — cùng lối truyền với `InputControls`. */
  styles: ReturnType<typeof bottomSheet>;
  title?: string;
  /** Cả cụm chuyển động, để hai file không lệch nhau về cách đóng tấm. */
  transition: ReturnType<typeof useSheetTransition>;
}

export function SheetSurface({
  alert,
  bodyClassName,
  children,
  className,
  description,
  footer,
  height,
  minHeight,
  padded,
  scrollable,
  search,
  showHandle,
  snapToContent,
  styles,
  title,
  transition,
}: SheetSurfaceProps) {
  const { animatedStyle, onSheetLayout, panGesture, requestClose } = transition;
  const insets = useSafeAreaInsets();
  /* ⛔ Hook, KHÔNG phải `Dimensions.get()` (đọc một lần): xoay máy lúc tấm đang
     mở thì trần chiều cao kẹt ở số đo cũ, tấm cao quá màn và mấy dòng cuối
     không cuộn tới được. `useBreakpoint` bọc `useWindowDimensions` nên vẽ lại
     đúng lúc. */
  const { height: windowHeight } = useBreakpoint();
  /* ⛔ Vùng an toàn NGANG: xoay ngang thì tai thỏ (~44dp) ăn qua cả đệm `px-4`
     (16dp) của vùng nội dung — chữ đầu hàng chui xuống dưới nó, nút sát mép bấm
     không ăn. ⚠️ Chỉ trừ phần LỀ THẬT mà trần 720dp đã chừa, ⛔ không cắt theo
     bậc `isTablet`: ở cửa sổ 740dp lề mỗi bên chỉ 10dp — xem `useSheetEdgeInset`. */
  const edgeInset = useSheetEdgeInset();

  const maxHeight = windowHeight * SHEET_MAX_HEIGHT_RATIO;

  return (
    /* ⚠️ `KeyboardAvoidingView` này của `react-native-keyboard-controller`,
          KHÔNG phải component cùng tên của RN: nó đo bàn phím ở tầng native
          nên `behavior="padding"` đúng trên CẢ hai nền tảng — mobile-ux.md.

          ⛔ Nó phải bọc RIÊNG tấm, và ⛔ KHÔNG được nhận `style={{ flex: 1 }}`.
          Bên trong thư viện, thẻ này là một `Reanimated.View` dựng
          `style={[styleCủaBạn, animatedStyle]}` (xem `components/
          KeyboardAvoidingView/index.js`) — mà Reanimated ghi đè prop `style`
          trên luồng UI bằng đúng object worklet trả về, nên `flex: 1` bị rơi
          và thẻ sập về chiều cao 0. Đặt nó ở LỚP NGOÀI CÙNG thì lớp neo
          `flex-1 justify-end` của `BottomSheet` không còn chỗ để chia:
            · nền mờ `absolute inset-0` co về 0 ⇒ KHÔNG có lớp phủ mờ nào;
            · `justify-end` mất tác dụng ⇒ tấm nhảy lên ĐỈNH màn hình, đè
              lên thanh trạng thái.
          ⚠️ Không có lỗi nào báo — đã dựng lại được trên máy thật.
          Bọc riêng tấm thì thẻ này không cần `flex`: nó cao bằng nội dung,
          và khi bàn phím mở thì `paddingBottom` của nó nâng tấm lên đúng
          chiều cao bàn phím. Chiều cao lớp neo lấy thẳng từ
          `GestureHandlerRootView`, không đi qua Reanimated nữa. */
    <KeyboardAvoidingView behavior="padding">
      {/* Báo cho con biết tấm ĐÃ nâng theo bàn phím (xem `sheet-keyboard-context.ts`) — ô soạn tin không được nâng thêm lần nữa. */}
      <SheetKeyboardHandledProvider value>
        {/* ⛔ `className` KHÔNG đặt lên `Animated.View`: NativeWind gộp class
          vào cùng object với `style`, Reanimated thấy `viewDescriptors`
          liền vứt sạch style đến từ class — tấm thành vô hình, không lỗi
          nào báo. Lớp này chỉ giữ vị trí, hình thức nằm ở `<View>` bên trong. */}
        <Animated.View style={animatedStyle}>
          <View
            className={styles.sheet({ className })}
            style={{
              maxHeight,
              minHeight: minHeight ?? sheetMinHeight(padded),
              height: height ?? (snapToContent ? undefined : maxHeight),
              /* ⛔ Vạch gạt ngang của iPhone ĐÈ lên đáy màn: không chừa chỗ
               thì nút cuối nằm ngay dưới nó và hệ điều hành nuốt cú chạm.
               ⚠️ Cả ba chiều đệm đặt ở LỚP TẤM (nơi có nền), không ở vùng
               nội dung — nền vẫn chạy hết bề ngang, chỉ chữ và nút thụt
               vào khỏi tai thỏ.

               ⚠️ CỘNG chứ không phải `Math.max`: Figma (`259:95393`) để
               nút kết thúc y=60 và `Home Indicator` ở y=76 ⇒ 16dp nằm
               THÊM trên vùng an toàn. `Math.max` thì iPhone (inset 34) ra
               đúng 34 và nút dính sát vạch gạt ngang. */
              paddingBottom: insets.bottom + SPACING.md,
              paddingLeft: edgeInset.left,
              paddingRight: edgeInset.right,
            }}
            onLayout={onSheetLayout}
          >
            <SheetHeader
              alert={alert}
              description={description}
              gesture={panGesture}
              search={search}
              showHandle={showHandle}
              title={title}
              onClose={requestClose}
            />

            {scrollable ? (
              <ScrollView
                className={styles.scrollBody()}
                contentContainerClassName={styles.body({ className: bodyClassName })}
                /* Mặc định, cú chạm đầu tiên khi bàn phím đang mở CHỈ đóng bàn
                 phím và không tới được nút bên trong tấm. */
                keyboardShouldPersistTaps="handled"
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
              >
                {children}
              </ScrollView>
            ) : (
              <View className={styles.body({ className: bodyClassName })}>{children}</View>
            )}

            {footer ? <View className={styles.footer()}>{footer}</View> : null}
          </View>
        </Animated.View>
      </SheetKeyboardHandledProvider>
    </KeyboardAvoidingView>
  );
}

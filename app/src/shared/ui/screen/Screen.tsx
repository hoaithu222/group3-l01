import { ScrollView, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { screen } from './screen.styles';
import { ScreenGradient } from './ScreenGradient';
import type { ScreenProps } from './screen.types';
import { useScreenBodyPadding } from './useScreenBodyPadding';
import { useScreenFooterHeight } from './useScreenFooterHeight';
import { useScreenRefreshControl } from './useScreenRefreshControl';

export type { ScreenProps } from './screen.types';

/**
 * Khung nền cho MỌI màn hình.
 *
 * Công thức class, số đo dải gradient và trần bề rộng cho máy tính bảng nằm ở
 * `screen.styles.ts`. Dải màu vẽ bằng `react-native-svg` — ⛔ KHÔNG cài
 * `expo-linear-gradient`, lý do đầy đủ ở `ScreenGradient.tsx`. Props ở
 * `screen.types.ts` (xem `footer` cho luật bàn phím/`KeyboardStickyView`).
 *
 * ── Vì sao `header` nằm NGOÀI vùng cuộn ─────────────────────────────────────
 * Thanh tiêu đề phải đứng yên khi nội dung cuộn — nếu không, nút "Quay lại"
 * trôi khỏi màn hình và người dùng phải cuộn ngược lên mới thoát được. Nhận
 * `ReactNode` chứ không nhận `title`: nơi gọi tự dựng `<AppBar>` với đúng biến
 * thể của nó, `Screen` không phải mọc thêm một bộ prop song song.
 */
export function Screen({
  children,
  className,
  constrained = true,
  contentClassName,
  footer,
  gradient = true,
  header,
  keyboardAware = false,
  padded = true,
  refreshing,
  scrollable = true,
  onRefresh,
}: ScreenProps) {
  const styles = screen({ constrained, hasHeader: Boolean(header), padded });

  /* Bốn cạnh vùng an toàn, mỗi cạnh một luật riêng — xem `useScreenBodyPadding`. */
  const bodyPadding = useScreenBodyPadding({
    hasFooter: Boolean(footer),
    hasHeader: Boolean(header),
  });

  /* `footer` (vd. `KeyboardStickyView` + `BottomActionBar`) nổi TRÊN nội dung khi
     bàn phím mở — xem `useScreenFooterHeight` để biết vì sao `bottomOffset` cần
     bằng chiều cao THẬT của nó, không phải hằng số. */
  const footerMeasure = useScreenFooterHeight();

  /**
   * ⚠️ Padding của nội dung đặt trên một `<View>` LỒNG BÊN TRONG, không phải
   * bằng `contentContainerClassName`. NativeWind chỉ dịch `className` cho những
   * component nó đã đăng ký; `contentContainerClassName` trên
   * `KeyboardAwareScrollView` (component của thư viện, không phải của RN) bị bỏ
   * qua ÂM THẦM. Một `<View>` thường thì luôn chắc chắn.
   */
  const inner = <View className={styles.content({ className: contentClassName })}>{children}</View>;

  /* Vòng quay kéo-để-làm-mới. `undefined` khi nơi gọi không truyền `onRefresh`
     — xem `useScreenRefreshControl` để biết vì sao nó là HOOK trả về phần tử
     chứ không phải một component bọc. */
  const refreshControl = useScreenRefreshControl({
    offset: bodyPadding.paddingTop,
    refreshing,
    scrollable,
    onRefresh,
  });

  const body = scrollable ? (
    keyboardAware ? (
      <KeyboardAwareScrollView
        bottomOffset={24 + (footer ? footerMeasure.height : 0)}
        className={styles.body()}
        contentContainerStyle={{ flexGrow: 1, ...bodyPadding }}
        // Cho phép bấm nút trong khi bàn phím đang mở. Mặc định, cú chạm đầu
        // tiên chỉ đóng bàn phím và KHÔNG tới được nút.
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
        // ⛔ Vệt cuộn TẮT ở MỌI màn (khung nền dùng chung) — Android vẽ nó dày và đục, ngay trên dải gradient của
        // `AppBar`/mép phải màn, trông như một lỗi vẽ hơn là tín hiệu "còn nội dung". Cuộn = cử chỉ đã quen tay trên
        // di động, không cần vệt chỉ báo. Cả app cùng luật — ESLint #12 (`eslint.config.js`) chặn vùng cuộn quên tắt.
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        {inner}
      </KeyboardAwareScrollView>
    ) : (
      <ScrollView
        className={styles.body()}
        contentContainerStyle={{ flexGrow: 1, ...bodyPadding }}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        {inner}
      </ScrollView>
    )
  ) : (
    <View className={styles.body()} style={bodyPadding}>
      {inner}
    </View>
  );

  return (
    <View className={styles.root({ className })}>
      {gradient ? (
        <View
          /* Dải màu là TRANG TRÍ: không được ăn cú chạm (nó phủ lên 20% trên
             cùng của màn, tức phủ cả thanh tiêu đề) và phải im lặng với trình
             đọc màn hình. ⚠️ Khai CẢ HAI prop trợ năng:
             `accessibilityElementsHidden` chỉ iOS nghe,
             `importantForAccessibility` chỉ Android nghe. */
          accessibilityElementsHidden
          className={styles.gradient()}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
        >
          <ScreenGradient />
        </View>
      ) : null}

      {header}
      {body}

      {/* ⛔ KHÔNG có `paddingBottom` ở đây — component đáy tự lo, xem JSDoc của
          prop `footer`. Cộng ở cả hai chỗ là thừa 68dp trên iPhone. */}
      {footer ? (
        <View className={styles.footer()} onLayout={footerMeasure.onLayout}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

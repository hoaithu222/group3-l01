import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import { appBar, STATUS_BAR_GAP, type AppBarVariant } from './app-bar.styles';

/**
 * Thanh tiêu đề trên cùng của một màn hình.
 *
 * Số đo (118 / 150 / 118 cho `Sm` · `Lg` · `Search`) và công thức class nằm ở
 * `app-bar.styles.ts`.
 *
 * ── Nền: thanh này KHÔNG tự đổ nền ───────────────────────────────────────────
 * Mặc định trong suốt (đo được `fills: []` — xem chú thích ở biến thể `opaque`).
 * Dải màu chuyển là của MÀN HÌNH, do `<Screen gradient>` vẽ, không phải của
 * thanh tiêu đề. Đặt cạnh nhau thì đúng như bản vẽ:
 *
 *     <Screen gradient header={<AppBar title="…" onBack={router.back} />}>
 *
 * ⛔ Đừng thêm `opaque` cho màn đã có gradient — hai mảng màu chồng lên nhau và
 * mép nối hiện ra thành một đường ngang không có trong thiết kế.
 */
export function AppBar({
  actions,
  className,
  contentClassName,
  leading,
  onBack,
  search,
  subtitle,
  title,
  opaque = false,
  variant = 'compact',
}: {
  /**
   * Nút bên phải (chia sẻ, trợ giúp…). Truyền phần tử bất kỳ.
   *
   * ⚠️ Bản vẽ chỉ có **2 khe** (`Icon R-1`, `Icon R-2`), mỗi nút 24dp, cách nhau
   * 12. Nhét nhiều hơn thì nhóm trái (`flex-1`) bị bóp và `numberOfLines={1}`
   * giấu luôn chuyện đó sau dấu "…" — không có lỗi nào báo.
   */
  actions?: ReactNode;
  /** Lớp cho lớp GỐC — nền, viền dưới, vùng an toàn. ⛔ Không phải nơi đè trần bề rộng. */
  className?: string;
  /**
   * Lớp cho HÀNG nội dung (`row` + `largeBlock`) — đúng node giữ trần 720dp
   * `tablet:max-w-content`.
   *
   * ⛔ `className` KHÔNG đè được trần đó: nó vào `root`, còn trần nằm ở `row`.
   * Trước đây không có lối nào khác, nên `<AppBar className="tablet:max-w-none">`
   * là truyền vào rồi im lặng không có tác dụng. Màn cần thanh tiêu đề trải hết
   * bề ngang máy tính bảng (bảng biểu, bản đồ — đi cùng `<Screen constrained={false}>`)
   * dùng `contentClassName="tablet:max-w-none"`.
   */
  contentClassName?: string;
  /** Thay chỗ nút quay lại. Không truyền thì dùng mũi tên mặc định (chỉ khi có `onBack`). */
  leading?: ReactNode;
  /** Truyền `router.back` từ nơi dùng. Không truyền ⇒ không vẽ nút — màn gốc không có chỗ để lùi về. */
  onBack?: () => void;
  /**
   * Ô tìm kiếm cho `variant="search"` — CHỈ có tác dụng ở biến thể đó.
   *
   * Nhận `ReactNode` chứ không tự dựng ô nhập: repo đã có `SearchInput` dùng
   * chung (`@/shared/ui/search`) với đủ nút xoá, trạng thái và luật ô nhập
   * uncontrolled. Dựng lại ở đây là hai ô tìm kiếm phải sửa song song.
   *
   *     <AppBar variant="search" search={<SearchInput {...s.inputProps} />} onBack={router.back} />
   */
  search?: ReactNode;
  /** ⚠️ Ngoài bản vẽ — component set Figma KHÔNG có khe phụ đề. Giữ vì màn giao dịch cần. */
  subtitle?: string;
  /** Bỏ trống ở `variant="search"`: chỗ của tiêu đề khi đó là ô tìm kiếm. */
  title?: string;
  /** Đổ nền đặc + viền dưới. Dùng cho màn KHÔNG có dải gradient phía sau. */
  opaque?: boolean;
  /**
   * `large` cho màn CẤP 1, `compact` cho màn cấp 2 trở đi (quy định của bản vẽ,
   * không phải sở thích) · `search` cho màn danh sách có ô tìm.
   */
  variant?: AppBarVariant;
}) {
  const insets = useSafeAreaInsets();
  const styles = appBar({ opaque, variant });
  const isLarge = variant === 'large';

  const titleBlock = title ? (
    <View className={styles.titleBlock()}>
      <Text
        className={styles.title()}
        /**
         * ⛔ Thiếu hai prop này là hỏng thật: tiếng Việt dài hơn tiếng Anh
         * khoảng 30%, "Xác nhận giao dịch chuyển tiền" sẽ đẩy hàng nút phải văng
         * ra khỏi màn hình — nút đóng/trợ giúp biến mất, không có lỗi nào báo.
         */
        ellipsizeMode="tail"
        numberOfLines={isLarge ? 2 : 1}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text className={styles.subtitle()} ellipsizeMode="tail" numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  ) : null;

  return (
    <View
      className={cn(styles.root(), className)}
      /**
       * ⛔ Đủ BA chiều vùng an toàn, không chỉ `top`.
       *
       * Xoay ngang là tai thỏ / camera đục lỗ nhảy sang mép TRÁI hoặc PHẢI, ăn
       * đúng chỗ nút "Quay lại" và hàng nút bên phải đang đứng: nút bị che một
       * nửa và hệ điều hành nuốt cú chạm ở dải đó — người dùng bấm mãi không
       * thoát được màn. Đệm nằm ở `root` (KHÔNG ở `row`) để nền + viền dưới của
       * biến thể `opaque` vẫn chạy hết bề ngang; `px-md` của `row` nằm gọn bên
       * trong. ⚠️ Style nội tuyến ĐÈ class chứ không cộng, nên nếu đặt ở `row`
       * thì `px-md` biến mất.
       */
      style={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingTop: insets.top + STATUS_BAR_GAP,
      }}
    >
      <View className={styles.row({ className: contentClassName })}>
        <View className={styles.leadingGroup()}>
          {leading ??
            (onBack ? (
              <Pressable
                accessibilityLabel="Quay lại"
                accessibilityRole="button"
                /**
                 * Mũi tên chỉ vẽ 24dp. Ghi chú thiết kế trong Figma ("Vùng chạm
                 * của icon Back") khoanh đỏ một ô **48×48** quanh nó — cao hơn
                 * ngưỡng tối thiểu 44dp, nên lấy đúng số của bản vẽ: 24 + 12×2.
                 *
                 * Nới bằng `hitSlop` chứ KHÔNG phóng to ô bấm: phóng to là lệch
                 * khoảng cách 16dp mép trái mà Figma chốt cho cả bộ màn hình.
                 */
                hitSlop={12}
                onPress={onBack}
              >
                <Icon color="fg-on-header" name="arrow-left" size={24} />
              </Pressable>
            ) : null)}
          {variant === 'search' ? (
            <View className={styles.searchSlot()}>{search}</View>
          ) : isLarge ? null : (
            titleBlock
          )}
        </View>
        {actions ? <View className={styles.actions()}>{actions}</View> : null}
      </View>
      {isLarge ? (
        <View className={styles.largeBlock({ className: contentClassName })}>{titleBlock}</View>
      ) : null}
    </View>
  );
}

import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { useContext } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Đệm vùng an toàn cho phần THÂN của `Screen`.
 *
 * Tách khỏi `Screen.tsx` vì bốn cạnh ở đây mỗi cạnh một luật riêng, mỗi luật một
 * lỗi đã gặp trên máy thật — để chung thì phần JSX bị chôn dưới chú thích và
 * file vượt trần 200 dòng của `src/shared/ui/AGENTS.md`.
 *
 * ⛔ Trả về style NỘI TUYẾN chứ không phải class: `insets` là số đo LÚC CHẠY,
 * khác nhau theo từng máy, không class Tailwind nào thay được.
 */
export function useScreenBodyPadding({
  hasFooter,
  hasHeader,
}: {
  /** Có `footer` thì chính footer đứng ở đáy và TỰ lo vùng an toàn dưới. */
  hasFooter: boolean;
  /** Thường là `<AppBar>` — nó tự cộng `insets.top` ở lớp gốc của chính nó. */
  hasHeader: boolean;
}) {
  const insets = useSafeAreaInsets();

  /**
   * ⛔ Màn nằm trong `<Tabs>` KHÔNG được cộng `insets.bottom` nữa.
   *
   * Đo được trong `expo-router/build/react-navigation/bottom-tabs/views/
   * BottomTabView.js`: thanh tab là ANH EM flex của vùng màn hình, và
   * `BottomTabView` **không** ghi đè `SafeAreaInsetsContext` cho màn con. Nghĩa
   * là thanh tab đã ăn trọn vùng vạch gạt ngang, nhưng màn hình bên trên vẫn
   * nhận `insets.bottom = 34` và cộng thêm một dải trống 34dp nữa — đúng ở
   * những màn chính người dùng nhìn nhiều nhất.
   *
   * `BottomTabBarHeightContext` là thứ chính `BottomTabView` cấp cho từng màn
   * con (giá trị 0 khi thanh tab không nằm dưới đáy). Ngoài `<Tabs>` thì context
   * không tồn tại ⇒ `undefined` ⇒ vẫn cộng vùng an toàn như cũ.
   */
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const safeBottom = tabBarHeight > 0 ? 0 : insets.bottom;

  /**
   * ⛔ Vùng an toàn TRÊN chỉ cộng khi màn KHÔNG có `header`.
   *
   * `AppBar` tự cộng `insets.top + STATUS_BAR_GAP` ở lớp gốc của nó, nên cộng
   * thêm ở đây là CỘNG HAI LẦN: thanh tiêu đề tụt xuống thêm ~24dp (Android)
   * hoặc ~54dp (iPhone tai thỏ) so với bản vẽ.
   *
   * ⚠️ Nhưng màn KHÔNG có header thì trước đây KHÔNG ai cộng cả — `bodyPadding`
   * chỉ có bottom/left/right. Mọi màn khác đều truyền `<AppBar>` nên lỗi bị che,
   * trừ `AuthScreenLayout`: nó gọi `<Screen keyboardAware>` không header, và
   * trên Android (`statusBarTranslucent`, thanh trạng thái ~24dp) tiêu đề
   * "Đăng nhập" nằm ĐÈ lên đồng hồ. Lộ rõ nhất lúc bàn phím mở: `flexGrow: 1`
   * nở khung theo nội dung nên `justify-center` hết tác dụng và đầu form dính
   * thẳng lên mép trên màn hình.
   */
  const topInset = hasHeader ? 0 : insets.top;

  /**
   * ⛔ Vùng an toàn NGANG là bắt buộc — `top`/`bottom` thôi là chưa đủ.
   *
   * Xoay ngang, tai thỏ (iPhone) và camera đục lỗ (Android) ăn vào mép TRÁI hoặc
   * PHẢI. Thiếu hai giá trị này thì hàng nào cũng mất mấy ký tự đầu dòng, và ở
   * màn xác nhận giao dịch là mất đúng chữ số hàng đầu của số tiền — không lỗi
   * nào báo, ảnh chụp thiết kế (luôn dựng dọc) cũng không lộ ra.
   *
   * ⚠️ Nơi ĐẶT kết quả này cũng là một phần của luật: đặt trên vùng CUỘN, ⛔
   * không đặt lên `root` (con `absolute` lấy mốc từ hộp ĐỆM của cha, nên đệm ở
   * `root` làm dải gradient hụt hai bên), và ⛔ cũng không gộp vào
   * `screen().content` (nơi có `px-md`): style nội tuyến ĐÈ class chứ không cộng
   * ⇒ mất luôn lề 16dp của bản vẽ. Lồng hai lớp thì 16dp nằm gọn BÊN TRONG vùng
   * an toàn.
   */
  return {
    paddingBottom: hasFooter ? 0 : safeBottom,
    paddingLeft: insets.left,
    paddingRight: insets.right,
    paddingTop: topInset,
  };
}

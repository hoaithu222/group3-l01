import { type ReactNode } from 'react';

/**
 * Props của `Screen`. Tách khỏi `Screen.tsx` vì file component phải ≤ 200 dòng
 * (xem `docs/rules/code-style.md`) — không phải vì kiểu dùng lại ở đâu khác.
 */
export interface ScreenProps {
  children: ReactNode;
  className?: string;
  /**
   * Trần bề rộng nội dung 720dp (`max-w-content`) từ `tablet:` (600dp) trở lên,
   * canh giữa màn.
   *
   * ⚠️ Trên ĐIỆN THOẠI prop này không đổi gì cả — class của nó đều có tiền tố
   * `tablet:`. Nó chỉ có nghĩa trên máy tính bảng và cửa sổ chia đôi rộng: thả
   * tự do thì một dòng chữ kéo dài 900dp, mắt hết dòng không dò lại được đầu.
   * ⛔ Tắt cho màn cần TRÀN hết bề ngang (bảng biểu, lưới ảnh, bản đồ) — ở đó
   * một cột 720dp biến máy tính bảng nằm ngang thành cái điện thoại to kèm hai
   * dải trống.
   */
  constrained?: boolean;
  /** Lớp bổ sung cho khối nội dung (không phải cho nền). */
  contentClassName?: string;
  /**
   * Thanh hành động dính đáy — nằm ngoài vùng cuộn.
   *
   * ⛔ `Screen` KHÔNG đệm vùng an toàn cho khe này — cả `bottom` lẫn
   * `left`/`right`; chính component đáy phải tự lo. `BottomActionBar` và
   * `BottomNav` đều đã cộng bên trong, và cả hai còn được dùng ĐỘC LẬP (trong
   * `KeyboardStickyView`, trong `<Tabs tabBar>`) nên không bỏ phần đó đi được.
   * Cộng thêm ở đây thì `<Screen footer={<BottomActionBar/>}>` cho **68dp**
   * trống dưới nút trên iPhone (bản vẽ chỉ có 16 + 21), còn đệm NGANG thì làm
   * nền đặc của thanh đáy thụt vào và hở một dải trong suốt sát mép.
   *
   * ⚠️ Vì vậy `<View>`/`<Button>` trần đặt vào đây đè lên vạch gạt ngang (xoay
   * ngang thì đè cả tai thỏ) — dùng `BottomActionBar`; ESLint chặn ca trần
   * (`no-restricted-syntax`). Khe này cũng KHÔNG có lề ngang riêng: thanh đáy đã
   * tự có `px-md`, thêm ở đây là 16 + 16 = 32dp.
   *
   * ⚠️ `keyboardAware` bù chiều cao THẬT của khe này vào `bottomOffset` của
   * `KeyboardAwareScrollView` — xem `useScreenFooterHeight`. Thiếu bù thì nội
   * dung cuối (thường là ô nhập cuối cùng) bị `footer` NỔI đè ngang giữa lúc
   * bàn phím mở.
   */
  footer?: ReactNode;
  /** Dải chuyển màu ở đầu màn. Bật sẵn theo ghi chú thiết kế; tắt cho màn có ảnh bìa riêng. */
  gradient?: boolean;
  /**
   * Thường là `<AppBar>`. Đứng yên khi nội dung cuộn.
   *
   * ⚠️ Với `gradient` đang bật thì ĐỪNG truyền gì thêm cho `AppBar`: nền trong
   * suốt đã là mặc định của nó, và trong Figma thanh tiêu đề KHÔNG có nền riêng
   * (bản vẽ lồng hẳn instance "Background Screen" vào frame "App bar"). Bật
   * `<AppBar opaque />` ở đây là chồng hai lớp `header-from` lệch độ trong lên
   * nhau, cộng thêm một đường viền dưới mà bản vẽ không có.
   *
   * ⛔ Prop tên là `opaque`, KHÔNG phải `transparent` — chú thích cũ ở dòng này
   * viết nhầm, làm theo là `tsc` đỏ.
   */
  header?: ReactNode;
  /**
   * Dùng `KeyboardAwareScrollView` thay cho `ScrollView` — bật cho MÀN CÓ Ô NHẬP.
   *
   * ⛔ Đừng bật đại trà: nó gắn bộ theo dõi bàn phím ở tầng native cho từng màn,
   * và trên màn không có ô nhập thì đó là chi phí không đổi lấy gì. Chỉ có tác
   * dụng khi `scrollable`.
   */
  keyboardAware?: boolean;
  /** Lề ngang 16dp theo Figma cho VÙNG NỘI DUNG (không gồm `footer`). Tắt cho màn hình có danh sách chạy sát mép. */
  padded?: boolean;
  /**
   * KÉO-ĐỂ-LÀM-MỚI: gọi khi người dùng kéo vùng cuộn xuống quá mép trên.
   *
   * ⚠️ `refreshing` là prop ĐIỀU KHIỂN — không tự tắt. Không đặt nó về `false`
   * khi tải xong thì vòng quay chạy mãi. Với React Query:
   *
   * ```tsx
   * const { isRefetching, refetch } = useQuery(...);
   * <Screen refreshing={isRefetching} onRefresh={() => void refetch()}>
   * ```
   *
   * ⛔ Chỉ có tác dụng khi `scrollable` (mặc định đã bật). Truyền cùng
   * `scrollable={false}` thì bị bỏ qua VÀ có cảnh báo ở chế độ dev — kéo mãi
   * không có gì xảy ra là thứ phải nhìn thấy được lúc lập trình.
   */
  onRefresh?: () => void;
  /** Đang tải lại hay không — xem `onRefresh`. */
  refreshing?: boolean;
  scrollable?: boolean;
}

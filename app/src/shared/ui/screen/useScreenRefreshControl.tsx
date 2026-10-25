import { type ReactElement } from 'react';
import { RefreshControl, type RefreshControlProps } from 'react-native';

import { useThemeColors } from '@/shared/theme';
import { logger } from '@/shared/utils/logger';

/**
 * Vòng quay KÉO-ĐỂ-LÀM-MỚI cho phần thân của `Screen`.
 *
 * Trả về một PHẦN TỬ `<RefreshControl>` chứ không phải một component bọc, và đó
 * là điều bắt buộc: ⛔ trên Android `ScrollView` **nhân bản** phần tử truyền vào
 * prop `refreshControl` rồi nhét `style` + `progressViewOffset` + cả cây nội
 * dung vào bản sao đó (xem `Libraries/Components/ScrollView/ScrollView.js`).
 * Bọc `RefreshControl` trong một component của mình thì `cloneElement` rót
 * những prop kia vào cái vỏ, vỏ không chuyển tiếp, và kết quả là nội dung không
 * hiện hoặc vòng quay nằm sai chỗ — không lỗi nào báo. Vì vậy đây là HOOK
 * (cần `useThemeColors`) trả về phần tử thật, không phải `<ScreenRefresh/>`.
 *
 * ── ⛔ Màu phải đi qua hook, không đi qua className ──────────────────────────
 * `tintColor` (iOS), `colors` và `progressBackgroundColor` (Android) nhận MÃ
 * MÀU thô — NativeWind không chạm tới được. Đây đúng là ca mà
 * `docs/rules/styling-nativewind.md` mục "Khi prop KHÔNG nhận className" nói
 * tới. Viết cứng `#00453C` thì ở chế độ tối vòng quay xanh đậm nằm trên nền
 * #070A0A và biến mất.
 *
 * Đo lại cả hai chế độ:
 *   · vòng quay `action-base` trên nền `bg-1` (nền ô tròn Android):
 *     10.96:1 sáng (#00453C / #FFFFFF) · 7.77:1 tối (#3ECFB2 / #1E2826);
 *   · vòng quay `action-base` trên nền màn `bg-base` (iOS không có ô tròn):
 *     9.96:1 sáng · 10.19:1 tối. Cả bốn đều trên ngưỡng 3:1 của hình phi văn bản.
 *
 * ⚠️ Kiểu trả về phải nói RÕ là phần tử `RefreshControl`: prop `refreshControl`
 * của `ScrollView` khai `ReactElement<RefreshControlProps>`, còn `ReactElement`
 * trần thì mang `unknown` ở chỗ props và `tsc` từ chối.
 */
export function useScreenRefreshControl({
  offset,
  refreshing = false,
  scrollable,
  onRefresh,
}: {
  /**
   * Đệm TRÊN của vùng cuộn (`useScreenBodyPadding().paddingTop`).
   *
   * ⚠️ Vòng quay neo vào KHUNG của `ScrollView`, không vào nội dung: đệm trong
   * `contentContainerStyle` đẩy nội dung xuống nhưng KHÔNG đẩy vòng quay. Màn
   * không có `header` thì đệm đó chính là `insets.top`, và thiếu bù trừ ở đây
   * là vòng quay hiện ngay dưới tai thỏ, chồng lên đồng hồ.
   * ⚠️ Màn CÓ `header` (kể cả `<Screen gradient>` với `AppBar` trong suốt) thì
   * số này là 0 và đúng: `AppBar` là ANH EM nằm TRÊN vùng cuộn chứ không đè lên
   * nó, nên mép trên của `ScrollView` đã ở ngay dưới thanh tiêu đề.
   */
  offset: number;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** `RefreshControl` chỉ gắn được vào vùng CUỘN. */
  scrollable: boolean;
}): ReactElement<RefreshControlProps> | undefined {
  /* ⛔ Gọi vô điều kiện: hook không được nằm sau một lệnh `return`. */
  const colors = useThemeColors();

  if (!onRefresh) return undefined;

  if (!scrollable) {
    /**
     * ⚠️ CẢNH BÁO chứ không im lặng bỏ qua.
     *
     * `<Screen scrollable={false} onRefresh={…}>` là một màn hình mà người dùng
     * kéo xuống mãi không có gì xảy ra, còn lập trình viên thì thấy `onRefresh`
     * nằm đó và tin là đã xong. Bỏ qua im lặng đúng là loại hỏng ÂM THẦM mà cả
     * repo này đang tránh; cảnh báo ở chế độ dev (mẫu của `Icon.tsx`) chỉ vào
     * đúng chỗ sai mà không làm gãy bản phát hành.
     */
    if (__DEV__) {
      logger.warn('[Screen] `onRefresh` chỉ có tác dụng khi `scrollable` — vòng quay bị bỏ qua.');
    }
    return undefined;
  }

  return (
    <RefreshControl
      /* Android vẽ nhiều cung nối tiếp nhau; một màu là đủ và đúng thương hiệu. */
      colors={[colors['action-base']]}
      progressBackgroundColor={colors['bg-1']}
      progressViewOffset={offset}
      refreshing={refreshing}
      tintColor={colors['action-base']}
      onRefresh={onRefresh}
    />
  );
}

import { BottomTabBarHeightCallbackContext } from 'expo-router/js-tabs';
import { useContext } from 'react';
import type { LayoutChangeEvent } from 'react-native';

/**
 * `onLayout` cho khối bọc thanh tab: báo CHIỀU CAO THẬT của thanh cho `BottomTabView`.
 *
 * ⛔ Thanh tab tự dựng PHẢI tự báo — `BottomTabBar` mặc định của React Navigation làm việc này trong `onLayout`, còn `BottomNav`
 * thì không. Không báo thì `BottomTabBarHeightContext` (cấp cho mọi màn con) mãi là số ƯỚC LƯỢNG lúc khởi tạo:
 * `49 + insets.bottom` (`getTabBarHeight`), trong khi `BottomNav` thật cao `54 + max(insets.bottom, 8)` (đệm trên 4 + hàng mục 50 của
 * nút Trang chủ, rồi vùng an toàn) — thấp hơn ≥ 5dp, và tới ~13dp khi `initialMetrics.insets.bottom` chưa có số.
 *
 * Ô soạn tin bù bằng đúng số đó (`ComposerBody` → `KeyboardStickyView offset.opened`) nên hụt bấy nhiêu: lúc bàn phím mở ô soạn lơ
 * lửng cách bàn phím một dải trống 5–13dp lộ danh sách tin phía sau. `tsc` lẫn test bố cục đều mù với sai lệch này — chỉ thấy trên
 * máy thật, và nhãn phóng to (Cỡ chữ: Lớn) làm nó lệch thêm nên không chốt được bằng hằng số. Ngoài `<Tabs>` không có callback ⇒ no-op.
 */
export function useReportTabBarHeight(): (event: LayoutChangeEvent) => void {
  const report = useContext(BottomTabBarHeightCallbackContext);
  return (event) => report?.(event.nativeEvent.layout.height);
}

import { Stack } from 'expo-router';

import { usePrintOrderSocket } from '@/features/o2o/hooks/usePrintOrderSocket';
import { FeatureRouteGuard } from '@/shell/capabilities';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * Ngăn xếp "Địa điểm & in ấn" (p6-05) nằm DƯỚI tab Tôi (`me/`): `me/_layout.tsx` là Stack nên các màn con KHÔNG bị đẩy thành tab. (app.md ghi
 * `app/(app)/o2o/` — thư mục mới cấp `(app)/` bị Expo Router tự dựng thành TAB, nên đặt trong `me/`.) File này vẫn cần có: thiếu nó thì
 * `map`, `locations/*`, `print/*` bị hoist lên `me/_layout.tsx` thành route ngang hàng, mất cờ + mất trình nghe socket của cả nhánh.
 *
 * Cờ `o2o` tắt → "chưa khả dụng" cho cả nhánh (kể cả deep link/thông báo trỏ vào). `usePrintOrderSocket` gắn MỘT lần ở đây: mọi màn của nhánh nhận
 * `print-order:updated`, và PIN của đơn đã kết thúc được xoá khỏi kho khoá ngay khi tin về.
 */
export default function O2oLayout() {
  usePrintOrderSocket();
  return (
    <FeatureRouteGuard flag="o2o">
      <Stack screenOptions={STACK_SCREEN_OPTIONS} />
    </FeatureRouteGuard>
  );
}

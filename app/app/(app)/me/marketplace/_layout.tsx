import { Stack } from 'expo-router';

import { FeatureRouteGuard } from '@/shell/capabilities';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * Ngăn xếp "Chợ tài liệu" (p7-02 P1) nằm DƯỚI tab Tôi (`me/`) — cùng lý do `me/coins/_layout.tsx`: thư mục MỚI cấp trực tiếp dưới `(app)/` bị Expo
 * Router tự dựng thành TAB (app.md gợi ý `(app)/marketplace/*`, đã đổi để không thêm tab — xem `utils/marketplace-routes.ts`). File này vẫn cần có:
 * thiếu nó thì `new`/`mine`/`[listingId]` bị hoist lên `me/_layout.tsx` thành route ngang hàng, mất cờ của cả nhánh.
 *
 * Cờ `coins` tắt → "chưa khả dụng" cho cả nhánh (kể cả deep link). Cờ RIÊNG `economy.marketplaceEnabled` không kiểm được ở đây (không có trong
 * `capabilities`) — từng màn tự hiện "Chợ chưa mở" qua lỗi `COIN_008` của lời gọi API tương ứng.
 */
export default function MarketplaceLayout() {
  return (
    <FeatureRouteGuard flag="coins">
      <Stack screenOptions={STACK_SCREEN_OPTIONS} />
    </FeatureRouteGuard>
  );
}

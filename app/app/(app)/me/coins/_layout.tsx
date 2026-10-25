import { Stack } from 'expo-router';

import { useCoinsEvents } from '@/features/coins';
import { FeatureRouteGuard } from '@/shell/capabilities';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * Ngăn xếp "Xu và cửa hàng" (p7-02) nằm DƯỚI tab Tôi (`me/`): `me/_layout.tsx` là Stack nên các màn con KHÔNG bị đẩy thành tab. (app.md ghi `(app)/me/shop/*` +
 * `me/wallet` — đổi thành MỘT nhánh `me/coins/*` để không lẫn với ví chi tiêu nhóm `features/wallet` và để gắn cờ + socket một lần.) File này vẫn cần có: thiếu nó thì
 * `shop`, `inventory` bị hoist lên `me/_layout.tsx` thành route ngang hàng, mất cờ + mất trình nghe socket của cả nhánh.
 *
 * Cờ `coins` tắt → "chưa khả dụng" cho cả nhánh (kể cả deep link). `useCoinsEvents` gắn MỘT lần ở đây: mọi màn của nhánh nhận `gamification:updated.coins`
 * (số dư ở đầu Ví và Cửa hàng đổi ngay khi nhận/tiêu xu ở thiết bị khác).
 */
export default function CoinsLayout() {
  useCoinsEvents();
  return (
    <FeatureRouteGuard flag="coins">
      <Stack screenOptions={STACK_SCREEN_OPTIONS} />
    </FeatureRouteGuard>
  );
}

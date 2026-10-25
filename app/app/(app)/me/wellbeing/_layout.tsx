import { Stack } from 'expo-router';

import { WellbeingRouteGate } from '@/features/wellbeing';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * Ngăn xếp "Sức khoẻ học tập" (p7-03) nằm DƯỚI tab Tôi (`me/`): `me/_layout.tsx` là Stack nên các màn con KHÔNG bị đẩy thành tab. File này vẫn cần có: thiếu nó thì `onboarding`,
 * `settings` bị hoist lên `me/_layout.tsx` thành route ngang hàng, mất hàng rào cờ của cả nhánh.
 *
 * Cờ `burnout` tắt → "chưa khả dụng" cho cả nhánh (kể cả deep link), NHƯNG màn đó vẫn giữ nút "Tắt theo dõi và xoá dữ liệu" (BE luôn nhận — quyền của người dùng không phụ thuộc cờ).
 */
export default function WellbeingLayout() {
  return (
    <WellbeingRouteGate>
      <Stack screenOptions={STACK_SCREEN_OPTIONS}>
        {/* P1 — Nghỉ 1 phút toàn màn mở dạng modal (app.md p7-03 §1). */}
        <Stack.Screen name="break" options={{ presentation: 'modal' }} />
      </Stack>
    </WellbeingRouteGate>
  );
}

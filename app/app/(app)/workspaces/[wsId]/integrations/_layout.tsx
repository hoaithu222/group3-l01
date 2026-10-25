import { Stack } from 'expo-router';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * Ngăn xếp "Tích hợp" của MỘT workspace (`index` · `[integrationId]`) — gộp thành MỘT nhóm, cùng lý do `resources/_layout.tsx` (thiếu file
 * này thì Expo Router "đẩy" từng file thành route ngang hàng). Điểm vào: mục "Tích hợp" trong cài đặt nhóm (p5-03 app.md §1).
 */
export default function IntegrationsLayout() {
  return <Stack screenOptions={STACK_SCREEN_OPTIONS} />;
}

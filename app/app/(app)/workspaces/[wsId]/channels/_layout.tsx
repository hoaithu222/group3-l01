import { Stack } from 'expo-router';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * Ngăn xếp cho phạm vi "Kênh" của MỘT workspace — gộp `index`/`new`/`[chId]/*`
 * thành MỘT tab con, cùng lý do với `(app)/workspaces/_layout.tsx` (thiếu file
 * này thì Expo Router "đẩy" từng file thành route ngang hàng).
 */
export default function ChannelsLayout() {
  return <Stack screenOptions={STACK_SCREEN_OPTIONS} />;
}

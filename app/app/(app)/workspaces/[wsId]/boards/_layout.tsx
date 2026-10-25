import { Stack } from 'expo-router';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

// p4-06: đăng ký lối vào "Báo cáo đóng góp" vào khe của màn bảng (side-effect) — `features/boards` không import `contribution`.
import '@/features/contribution/register';

/**
 * Ngăn xếp cho phạm vi "Việc" (bảng công việc) của MỘT nhóm — gộp `index`/`new`/
 * `[boardId]/*` thành một cụm, cùng lý do với `channels/_layout.tsx` (thiếu file
 * này thì Expo Router "đẩy" từng file thành route ngang hàng).
 */
export default function BoardsLayout() {
  return <Stack screenOptions={STACK_SCREEN_OPTIONS} />;
}

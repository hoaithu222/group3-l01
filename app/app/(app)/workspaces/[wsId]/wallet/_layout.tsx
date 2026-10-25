import { Stack, useLocalSearchParams } from 'expo-router';

import { useWalletSocket } from '@/features/wallet/hooks/useWalletSocket';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * Ngăn xếp cho phạm vi "Ví nhóm" của MỘT workspace — gộp `index`/`expenses/*`/`settle`/`history`/
 * `settings` thành MỘT nhánh con của `[wsId]` (thiếu file này thì Expo Router "đẩy" từng file thành
 * route ngang hàng, cùng lý do `channels/_layout.tsx`).
 *
 * `useWalletSocket(wsId)` gắn Ở ĐÂY (một lần cho cả nhánh) chứ không lặp ở từng màn: `wallet:updated`
 * làm mới cache ví (debounce 500 ms) cho MỌI màn ví đang mở, và tự dừng khi rời nhánh này. Thiếu
 * `useWorkspaceScope`/hàng rào GUEST ở đây là có chủ đích — `[wsId]/_layout.tsx` đã lo mất-quyền-nhóm,
 * còn GUEST/cờ `wallet` tắt do từng màn hiện `WalletDenied` (không chuyển hướng: người dùng vẫn ở
 * trong nhóm, chỉ không có ví).
 */
export default function WalletLayout() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  useWalletSocket(wsId);

  return <Stack screenOptions={STACK_SCREEN_OPTIONS} />;
}

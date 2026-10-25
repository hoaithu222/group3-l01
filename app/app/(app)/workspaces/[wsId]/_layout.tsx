import { Stack, useLocalSearchParams } from 'expo-router';

import { useChannelSocket } from '@/features/channels/hooks/useChannelSocket';
import { useWorkspaceScope } from '@/features/workspaces/hooks/useWorkspaceScope';
import { useWorkspaceSocket } from '@/features/workspaces/hooks/useWorkspaceSocket';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * Ngăn xếp cho phạm vi MỘT workspace (`index` tổng quan · `settings` ·
 * `channels/*`).
 *
 * `useWorkspaceScope(wsId, { redirectWhenGone })` — hàng rào "mất quyền" cho
 * TRƯỜNG HỢP KHÔNG có socket: mở thẳng deep link `/w/{wsId}` của nhóm đã bị
 * loại/không phải thành viên thì `GET /workspaces/:id` trả 404 trung tính (WS-08)
 * → về `/workspaces`. Trường hợp đang mở mà bị loại vẫn do `useWorkspaceSocket`
 * (`permission:revoked`) lo, hai đường không giẫm nhau vì `router.replace` cùng đích.
 *
 * `useWorkspaceSocket(wsId)` gọi Ở ĐÂY (không lặp lại trong từng màn con) để
 * điều hướng ra `/workspaces` NGAY khi `permission:revoked` tới đúng workspace
 * đang mở — bất kể đang ở tổng quan hay cài đặt. Room `ws:{id}` server tự
 * join lúc connect (be.md p1-01 §6), không cần `room:join` tường minh.
 *
 * `useChannelSocket(wsId)` (p1-03 app.md §4) gắn CÙNG chỗ — đồng bộ cache
 * `channel:*` cho MỌI kênh của workspace này, kể cả kênh KHÔNG đang mở (vd
 * đang đứng ở danh sách kênh khi bị thu hồi quyền một kênh riêng tư khác).
 * Điều hướng-ra-khi-MẤT-QUYỀN-kênh-ĐANG-MỞ là việc riêng của `useChannelScope`
 * (`channels/[chId]/_layout.tsx`) — hook đó mới biết chắc kênh nào đang mở.
 */
export default function WorkspaceScopeLayout() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  useWorkspaceScope(wsId, { redirectWhenGone: true });
  useWorkspaceSocket(wsId);
  useChannelSocket(wsId);

  return <Stack screenOptions={STACK_SCREEN_OPTIONS} />;
}

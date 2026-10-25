import { Stack, useLocalSearchParams } from 'expo-router';

import { BoardScopeProvider } from '@/features/boards';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * Ngăn xếp cho phạm vi MỘT bảng (kanban · cài đặt · chi tiết thẻ).
 * `BoardScopeProvider` gắn Ở ĐÂY (không lặp ở từng màn con) để `room:join`
 * (`board:{id}`) đúng MỘT lần khi vào bảng, `room:leave` khi rời, và điều hướng ra
 * hub nhóm ngay khi mất quyền — bất kể đang ở Kanban hay Cài đặt (app.md p3-02 §1).
 *
 * Chi tiết thẻ (p3-03) là `modal` trên điện thoại (app.md p3-03 §1); màn sửa mô tả mở chồng lên nó.
 */
export default function BoardScopeLayout() {
  const { boardId, wsId } = useLocalSearchParams<{ boardId: string; wsId: string }>();

  return (
    <BoardScopeProvider boardId={boardId} wsId={wsId}>
      <Stack screenOptions={STACK_SCREEN_OPTIONS}>
        <Stack.Screen name="tasks/[taskId]" options={{ presentation: 'modal' }} />
        {/* p4-05: màn chấm mở chồng lên chi tiết thẻ (hoặc trực tiếp từ thông báo `review.requested`). */}
        <Stack.Screen name="tasks/[taskId]/review" options={{ presentation: 'modal' }} />
      </Stack>
    </BoardScopeProvider>
  );
}

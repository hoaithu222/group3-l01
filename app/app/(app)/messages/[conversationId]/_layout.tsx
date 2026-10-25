import { Stack, useLocalSearchParams } from 'expo-router';

import { useConversationScope } from '@/features/conversations/hooks/useConversationScope';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * Ngăn xếp cho phạm vi MỘT hội thoại (chat · info · members · add-members ·
 * media). `useConversationScope` gọi Ở ĐÂY (room:join `conv:{id}` + điều
 * hướng ra `/messages` khi mất quyền/bị xoá) — cùng mẫu
 * `workspaces/[wsId]/channels/[chId]/_layout.tsx` (p1-03).
 */
export default function ConversationScopeLayout() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  useConversationScope(conversationId);

  return <Stack screenOptions={STACK_SCREEN_OPTIONS} />;
}

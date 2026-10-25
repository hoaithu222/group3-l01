import { useLocalSearchParams } from 'expo-router';

import { ScopeReportsScreen } from '@/features/moderation';

/** Hàng đợi báo cáo của MỘT nhóm chat (OWNER/ADMIN nhóm — p1-08 #9); mở từ `messages/[conversationId]/info`. */
export default function ConversationReportsRoute() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  return <ScopeReportsScreen scope={{ type: 'CONVERSATION', id: conversationId }} />;
}

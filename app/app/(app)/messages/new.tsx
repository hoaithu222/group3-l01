import { useLocalSearchParams } from 'expo-router';

import { DraftDirectScreen } from '@/features/conversations/screens/DraftDirectScreen';
import { NewConversationScreen } from '@/features/conversations/screens/NewConversationScreen';

/** app.md §1 — `?userId=` chuyển route này sang `DraftDirectScreen`. */
export default function NewConversationRoute() {
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  return userId ? <DraftDirectScreen /> : <NewConversationScreen />;
}

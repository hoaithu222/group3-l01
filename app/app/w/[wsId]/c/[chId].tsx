import { useLocalSearchParams } from 'expo-router';

import { DeepLinkRedirect } from '@/shell/deeplink';

/**
 * app.md p1-03 §1 — `https://<domain>/w/{wsId}/c/{chId}?m={messageId}` mở kênh,
 * cuộn quanh tin `m` (`ChannelChatScreen` đọc `m` → `ChatRoom.initialMessageId`).
 * Chỉ chuyển tiếp, cùng mẫu `app/w/[wsId]/index.tsx`; đích + `m` (chỉ mang theo khi có) do bộ xử lý
 * `MESSAGE_LINK` của `shell/deeplink` quyết định (p0-12) — cùng đích như trước.
 */
export default function ShortChannelLinkRoute() {
  const { wsId, chId, m } = useLocalSearchParams<{ wsId: string; chId: string; m?: string }>();
  return <DeepLinkRedirect intent={{ chId, messageId: m, type: 'MESSAGE_LINK', wsId }} />;
}

import { useLocalSearchParams } from 'expo-router';

import { DeepLinkRedirect } from '@/shell/deeplink';

/**
 * p0-12 README §5 — `https://<domain>/c/{conversationId}?m={messageId}` mở hội thoại 1-1/nhóm, cuộn quanh tin `m`
 * (`ConversationScreen` đọc `m`). Chỉ chuyển tiếp, ngoài nhóm `(app)` (cùng mẫu `app/m/[id].tsx`, `app/w/[wsId]/c/[chId].tsx`):
 * hàng rào đăng nhập của `(app)/_layout.tsx` áp dụng ở route đích; chưa đăng nhập thì `post-login-intent` nhớ đường dẫn này
 * (`/c/…`) để quay lại sau khi đăng nhập.
 *
 * Link hội thoại đời cũ `/m/{id}` (p1-05) vẫn chạy ở `app/m/[id].tsx` — `/c/` là đường dẫn chính thức từ p0-12.
 */
export default function ConversationLinkRoute() {
  const { conversationId, m } = useLocalSearchParams<{ conversationId: string; m?: string }>();
  return <DeepLinkRedirect intent={{ conversationId, messageId: m, type: 'CONVERSATION' }} />;
}

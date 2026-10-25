import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * app.md p1-06 §1 — `https://<domain>/w/{wsId}/c/{chId}/t/{messageId}?m={replyId}` mở màn luồng của tin gốc
 * `messageId`, cuộn quanh reply `m`. Chỉ chuyển tiếp, cùng mẫu `app/w/[wsId]/c/[chId].tsx`; `m` chỉ mang theo khi có.
 * `ThreadScreen` tự quay về màn kênh khi không có lịch sử để lùi (mở từ liên kết ngoài).
 */
export default function ShortThreadLinkRoute() {
  const { wsId, chId, messageId, m } = useLocalSearchParams<{
    wsId: string;
    chId: string;
    messageId: string;
    m?: string;
  }>();
  return (
    <Redirect
      href={{
        pathname: '/workspaces/[wsId]/channels/[chId]/thread/[messageId]',
        params: m ? { wsId, chId, messageId, m } : { wsId, chId, messageId },
      }}
    />
  );
}

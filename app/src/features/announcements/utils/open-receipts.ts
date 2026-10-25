import { router } from 'expo-router';

export interface ReceiptsTarget {
  workspaceId: string;
  channelId: string;
  messageId: string;
}

/**
 * Mở danh sách đã/chưa xác nhận. Route nằm trong cây kênh nên cần cả `wsId` lẫn `chId` — kênh không import `announcements`,
 * chiều ngược lại (feature này đẩy route của kênh bằng đường dẫn typed) thì được.
 */
export function openReceipts({ channelId, messageId, workspaceId }: ReceiptsTarget): void {
  router.push({
    params: { chId: channelId, messageId, wsId: workspaceId },
    pathname: '/workspaces/[wsId]/channels/[chId]/announcement/[messageId]',
  });
}

import { useEffect } from 'react';

import type { ChatRoomHostProps } from '@/shared/message-extensions';
import { useFeature } from '@/shell/capabilities';

import { useAnnouncementSocket } from '../hooks/useAnnouncementSocket';
import { useChannelAnnouncements } from '../queries/announcements.queries';
import { useAnnouncementIntentStore } from '../store/announcement-intent.store';
import { CancelRequestDialog } from './CancelRequestDialog';
import { RequestConfirmSheet } from './RequestConfirmSheet';

function AnnouncementHostBody({ channelId }: { channelId: string }) {
  useChannelAnnouncements(channelId);
  useAnnouncementSocket(channelId);

  const intent = useAnnouncementIntentStore((state) => state.intent);
  const session = useAnnouncementIntentStore((state) => state.session);
  const clear = useAnnouncementIntentStore((state) => state.clear);
  const mine = intent?.channelId === channelId ? intent : null;

  // Rời phòng chat mà tấm/hộp thoại còn mở ⇒ không để ý định treo lại (lần vào kênh sau sẽ tự bật lại tấm). Chỉ xoá ý định
  // của CHÍNH kênh này: phòng khác (vd panel chat của phòng thoại) có thể đang giữ ý định của nó.
  useEffect(
    () => () => {
      const store = useAnnouncementIntentStore.getState();
      if (store.intent?.channelId === channelId) store.clear();
    },
    [channelId],
  );

  return (
    <>
      <RequestConfirmSheet
        key={session}
        channelId={channelId}
        messageId={mine?.kind === 'request' ? mine.messageId : null}
        visible={mine?.kind === 'request'}
        onClose={clear}
      />
      <CancelRequestDialog
        channelId={channelId}
        messageId={mine?.kind === 'cancel' ? mine.messageId : null}
        visible={mine?.kind === 'cancel'}
        onClose={clear}
      />
    </>
  );
}

/**
 * MỘT lần mỗi phòng chat kênh (khe `roomHost` của `chat`): TẢI danh sách yêu cầu của kênh (nguồn của mọi huy hiệu), nghe
 * socket, và dựng tấm "Yêu cầu"/hộp thoại "Huỷ" mà dòng menu tin mở qua store. Cờ `readConfirm` tắt (hoặc chưa biết)
 * ⇒ không tải, không nghe, không dựng gì — bong bóng giữ hình dạng cũ.
 */
export function AnnouncementHost({ scope }: ChatRoomHostProps) {
  const enabled = useFeature('readConfirm') === true;
  return enabled ? <AnnouncementHostBody channelId={scope.scopeId} /> : null;
}

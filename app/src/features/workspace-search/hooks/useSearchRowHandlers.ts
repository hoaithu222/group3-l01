import { useCallback, useMemo } from 'react';

import { toErrorMessage } from '@/core/api/client.helpers';
import { showToast } from '@/shared/utils/toast.utils';

import type { ChannelHit, FileHit, MeetingHit, MessageHit, PersonHit } from '../api';
import type { SearchRowHandlers } from '../components/SearchResultRow';
import { useJoinChannelFromSearch } from '../queries/channel-join.mutations';
import {
  openChannelHit,
  openFileHit,
  openMeetingHit,
  openMessageHit,
  openPersonHit,
} from '../utils/open-result';

export interface SearchRowHandlersOptions {
  /** Máy tính bảng: chạm một tin CHỈ CHỌN để xem trước (mở thật ở nút "Mở tin nhắn"). Bỏ trống = mở ngay như điện thoại. */
  onSelectMessage?: (hit: MessageHit) => void;
  /** Chốt từ khoá vào "tìm gần đây" — gọi ngay trước khi rời màn để mở một kết quả. */
  remember: () => void;
  workspaceId: string;
}

/**
 * Mọi thứ xảy ra khi CHẠM một hàng kết quả, gom một chỗ: mở đúng đích theo loại (`open-result`), ghi nhớ từ khoá, và "Tham
 * gia" kênh công khai ngay trên hàng (lỗi hiện bằng toast vì `skipErrorToast` — mutation này không có chỗ hiện lỗi tại chỗ).
 * Mỗi handler ỔN ĐỊNH theo `useCallback` để hàng `memo` không vẽ lại khi màn vẽ lại.
 */
export function useSearchRowHandlers({
  onSelectMessage,
  remember,
  workspaceId,
}: SearchRowHandlersOptions) {
  const join = useJoinChannelFromSearch(workspaceId);
  const { mutate: joinChannel } = join;

  const openMessage = useCallback(
    (hit: MessageHit) => {
      remember();
      openMessageHit(workspaceId, hit);
    },
    [remember, workspaceId],
  );
  const onMessage = onSelectMessage ?? openMessage;

  const onFile = useCallback(
    (hit: FileHit) => {
      remember();
      openFileHit(workspaceId, hit);
    },
    [remember, workspaceId],
  );
  const onChannel = useCallback(
    (hit: ChannelHit) => {
      remember();
      openChannelHit(workspaceId, hit);
    },
    [remember, workspaceId],
  );
  const onPerson = useCallback(
    (hit: PersonHit) => {
      remember();
      openPersonHit(hit);
    },
    [remember],
  );
  const onMeeting = useCallback(
    (hit: MeetingHit) => {
      remember();
      openMeetingHit(hit);
    },
    [remember],
  );
  const onJoin = useCallback(
    (hit: ChannelHit) => {
      joinChannel(hit.channelId, {
        onError: (error) => showToast('error', toErrorMessage(error)),
        onSuccess: () => showToast('success', `Đã tham gia #${hit.name}`),
      });
    },
    [joinChannel],
  );

  const handlers = useMemo<SearchRowHandlers>(
    () => ({ onChannel, onFile, onJoin, onMeeting, onMessage, onPerson }),
    [onChannel, onFile, onJoin, onMeeting, onMessage, onPerson],
  );

  return { handlers, joiningId: join.isPending ? (join.variables ?? null) : null, openMessage };
}

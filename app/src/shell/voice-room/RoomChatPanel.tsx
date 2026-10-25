import { useRoomSubscription } from '@/core/socket';
import { ChatRoom, useChatScope } from '@/features/chat';
import { useChannelAuthors } from '@/features/channels/hooks/useChannelAuthors';
import { useChannel } from '@/features/channels/queries/channels.queries';

/**
 * Chat của PHÒNG THOẠI = tin của chính kênh VOICE (p2-03 app.md §2 `RoomChatSheet`): `ChatRoom` dùng chung của feature nền `chat`, cùng
 * lịch sử/outbox với màn chat kênh — tin gửi trong phòng vẫn còn sau phiên.
 *
 * ⚠️ Vì sao file này nằm ở `shell/` chứ không ở `calls`/`channels`: nó ghép HAI feature (`chat` + `channels`: quyền gửi, tên tác giả) mà
 * `calls` không được import chéo — cùng vai trò "nơi lắp ráp" như `app/(app)/_layout.tsx`. Route (`call/[callId]`, kênh VOICE) truyền nó
 * xuống `CallScreen`/`VoiceRoomPreviewScreen` qua props `renderRoomChat`.
 *
 * ⚠️ Chưa kiểm chứng trên máy thật: `ChatRoom` (có ô nhập + bàn phím) nằm trong tấm trượt `<Modal>` — cần thử trên thiết bị (bàn phím
 * đẩy composer, cuộn danh sách trong tấm).
 */
export function RoomChatPanel({ channelId }: { channelId: string }) {
  useRoomSubscription('ch', channelId); // nhận tin mới realtime dù màn kênh (đã join room) không còn ở trên cùng
  const scope = useChatScope('CHANNEL', channelId);
  const channel = useChannel(channelId).data;
  const resolveAuthor = useChannelAuthors(channelId);

  return (
    <ChatRoom
      capabilities={{ canWrite: channel?.myPermissions.canWrite ?? false }}
      emptyHint="Chưa có tin nhắn nào — nhắn để bắt đầu cuộc trò chuyện của phòng."
      resolveAuthor={resolveAuthor}
      scope={scope}
    />
  );
}

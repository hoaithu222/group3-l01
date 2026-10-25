import { useLocalSearchParams } from 'expo-router';

import { VoiceRoomPreviewScreen } from '@/features/calls';
import { ChannelHeader } from '@/features/channels/components/ChannelHeader';
import { useChannel } from '@/features/channels/queries/channels.queries';
import { ChannelChatScreen } from '@/features/channels/screens/ChannelChatScreen';
import { PomodoroRoomScreen } from '@/features/pomodoro';
import { FeatureRouteGuard } from '@/shell/capabilities';
import { RoomChatPanel } from '@/shell/voice-room/RoomChatPanel';

/**
 * Kênh chữ → màn chat; kênh VOICE (p2-03 app.md §1) → PREVIEW phòng thoại (chạm kênh chỉ xem, không vào phòng); kênh POMODORO (p5-02 app.md §1) →
 * `PomodoroRoomScreen` (preview ↔ trong phòng), bọc `FeatureRouteGuard flag="pomodoro"`. Chọn theo `type` ở route (nơi lắp ráp) vì `channels` không
 * import `calls`/`pomodoro`; route cũng cấp `ChannelHeader` (tìm/ghim/thành viên/thông tin — quản lý kênh vẫn vào được) và chat phòng thoại. Đang tải chi
 * tiết kênh thì để `ChannelChatScreen` vẽ khung chờ như cũ.
 */
export default function ChannelChatRoute() {
  const { chId, wsId } = useLocalSearchParams<{ chId: string; wsId: string }>();
  const channel = useChannel(chId).data;

  if (channel?.type === 'VOICE') {
    return (
      <VoiceRoomPreviewScreen
        channelId={chId}
        header={<ChannelHeader channel={channel} wsId={wsId} />}
        renderRoomChat={(id) => <RoomChatPanel channelId={id} />}
        wsId={wsId}
      />
    );
  }
  if (channel?.type === 'POMODORO') {
    return (
      <FeatureRouteGuard flag="pomodoro">
        <PomodoroRoomScreen channelId={chId} header={<ChannelHeader channel={channel} wsId={wsId} />} wsId={wsId} />
      </FeatureRouteGuard>
    );
  }
  return <ChannelChatScreen />;
}

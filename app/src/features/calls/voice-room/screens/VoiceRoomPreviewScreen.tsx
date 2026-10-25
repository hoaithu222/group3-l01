import { isAxiosError } from 'axios';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useConnectionState } from '@/core/socket';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';
import { useFeature } from '@/shell/capabilities';

import { CallErrorDialogs } from '../../components/CallErrorDialogs';
import { useCallStore } from '../../store/call.store';
import { useVoicePreview } from '../api/voice-room.queries';
import type { JoinBlockedReason } from '../api/voice-room.types';
import { JoinOptions } from '../components/JoinOptions';
import { RoomChatSheet } from '../components/RoomChatSheet';
import { SwitchCallDialog } from '../components/SwitchCallDialog';
import { VoiceRoomPreviewCard } from '../components/VoiceRoomPreviewCard';
import { useJoinVoiceRoom } from '../hooks/useJoinVoiceRoom';
import { useVoicePreviewLive } from '../hooks/useVoicePreviewLive';

export interface VoiceRoomPreviewScreenProps {
  channelId: string;
  /** Thanh tiêu đề của kênh (tìm/ghim/thành viên/thông tin) do route cấp — `calls` không import `channels`. Vắng ⇒ thanh tiêu đề đơn giản. */
  header?: ReactNode;
  /** Chat phòng = tin của kênh; nơi lắp ráp (route kênh) cấp — `calls` không import `chat`. Vắng ⇒ ẩn nút "Chat của phòng". */
  renderRoomChat?: (channelId: string) => ReactNode;
  wsId: string;
}

const BLOCKED_TEXT: Record<JoinBlockedReason, string> = {
  ARCHIVED: 'Kênh đã lưu trữ — chỉ xem, không vào phòng được.',
  FULL: 'Phòng đã đủ người.',
  REMOVED: 'Bạn đã được mời ra khỏi phiên phòng này. Phiên mới bắt đầu thì vào được.',
};

const isNotFound = (error: unknown): boolean => isAxiosError(error) && error.response?.status === 404;

/**
 * Màn KÊNH VOICE (app.md §1, §3): chạm kênh chỉ mở PREVIEW — không xin quyền, không tạo phiên, không vào phòng (VR-01). Ai đang trong
 * phòng cập nhật realtime (`useVoicePreviewLive`); "Tham gia"/"Tham gia để nghe" mới là ý định vào phòng. Nút vào chỉ hiện khi SERVER nói
 * `myActions.canJoin` (client không tự suy quyền); kênh lưu trữ → chỉ đọc; cờ `voice` tắt → không dựng nút.
 */
export function VoiceRoomPreviewScreen({ channelId, header: channelHeader, renderRoomChat, wsId }: VoiceRoomPreviewScreenProps) {
  const enabled = useFeature('voice') === true;
  const offline = useConnectionState() === 'offline';
  const preview = useVoicePreview(channelId, enabled);
  useVoicePreviewLive(channelId);
  const { confirmSwitch, dismissFailure, dismissSwitch, failure, join, pending, switchPrompt } = useJoinVoiceRoom(channelId);
  const [chatOpen, setChatOpen] = useState(false);
  const inThisRoom = useCallStore((s) => (s.phase === 'idle' || s.phase === 'ended' ? null : s.call?.scopeId) === channelId);

  const toChannels = () => router.replace({ params: { wsId }, pathname: '/workspaces/[wsId]/channels' });
  const header = channelHeader ?? <AppBar title={preview.data ? `#${preview.data.channel.name}` : 'Phòng thoại'} onBack={() => router.back()} />;

  if (!enabled) {
    return (
      <Screen header={header} scrollable={false}>
        <EmptyState
          description="Tính năng gọi chưa được bật cho hệ thống này."
          fullscreen
          icon="mic-01"
          title="Phòng thoại chưa sẵn sàng"
          tone="neutral"
        />
      </Screen>
    );
  }
  if (preview.isLoading) {
    return (
      <Screen header={header} scrollable={false}>
        <View className="gap-sm py-md">
          <Skeleton className="h-32 rounded-md" />
          <Skeleton className="h-12 rounded-md" />
        </View>
      </Screen>
    );
  }
  if (preview.isError || !preview.data) {
    const gone = isNotFound(preview.error);
    return (
      <Screen header={header} scrollable={false}>
        <EmptyState
          actions={gone ? [{ label: 'Về danh sách kênh', onPress: toChannels }] : [{ label: 'Thử lại', onPress: () => void preview.refetch() }]}
          description={gone ? 'Bạn không còn quyền xem hoặc kênh đã bị xoá.' : toErrorMessage(preview.error)}
          fullscreen
          icon={gone ? 'mic-01' : 'alert-warning'}
          title={gone ? 'Kênh không còn khả dụng' : 'Không tải được phòng'}
          tone={gone ? 'neutral' : 'danger'}
        />
      </Screen>
    );
  }

  const { channel, myActions } = preview.data;
  const reason = myActions.joinBlockedReason;
  // ARCHIVED/REMOVED đã có `Alert` nói lý do ở đầu màn — chỉ "đầy" và "mất mạng" cần chữ ngay dưới nút.
  const hint = offline ? 'Cần kết nối mạng để tham gia.' : reason === 'FULL' ? BLOCKED_TEXT.FULL : null;

  return (
    <Screen header={header} scrollable={false}>
      <ScrollView
        contentContainerClassName="gap-md p-md"
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        {myActions.joinBlockedReason === 'ARCHIVED' ? <Alert description={BLOCKED_TEXT.ARCHIVED} tone="info" /> : null}
        {myActions.joinBlockedReason === 'REMOVED' ? <Alert description={BLOCKED_TEXT.REMOVED} tone="warning" /> : null}
        <VoiceRoomPreviewCard preview={preview.data} />
        {inThisRoom ? (
          <Button fullWidth label="Quay lại phòng" onPress={() => join({ camera: false, listenOnly: false })} />
        ) : myActions.joinBlockedReason === 'ARCHIVED' ? null : (
          <JoinOptions
            allowVideo={channel.voiceSettings.allowVideo}
            disabled={offline || !myActions.canJoin}
            hint={hint}
            loading={pending}
            onJoin={(options) => void join(options)}
          />
        )}
        {renderRoomChat ? <Button fullWidth iconLeft="chat-bubble" label="Chat của phòng" variant="tertiary" onPress={() => setChatOpen(true)} /> : null}
      </ScrollView>
      {renderRoomChat ? <RoomChatSheet channelId={channelId} renderChat={renderRoomChat} visible={chatOpen} onClose={() => setChatOpen(false)} /> : null}
      <SwitchCallDialog prompt={switchPrompt} onConfirm={() => void confirmSwitch()} onDismiss={dismissSwitch} />
      <CallErrorDialogs failure={failure} onClose={dismissFailure} />
    </Screen>
  );
}

import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';

import { useVoiceRoomStore } from '../store/voice-room.store';
import { AudioBlockedNotice } from './AudioBlockedNotice';
import { InviteSpeakPrompt } from './InviteSpeakPrompt';
import { MuteRequestPrompt } from './MuteRequestPrompt';

export interface VoiceRoomNoticesProps {
  /** "Chưa có quyền micro — chỉ nghe được" (vào phòng KHÔNG ở chế độ "để nghe" mà bị từ chối quyền). */
  micDenied: boolean;
  onEnableMic: () => void;
  onMuteMic: () => void;
  /** Đang kết nối lại (SDK báo `reconnecting`) — quá ~30 s SDK bỏ cuộc và phòng quay về preview. */
  reconnecting: boolean;
}

/** Cụm lời nhắc trong phòng: mất kết nối · bị chặn phát biểu · đề nghị tắt mic · mời phát biểu · thiếu quyền micro. Đọc từ `voiceRoomStore`. */
export function VoiceRoomNotices({ micDenied, onEnableMic, onMuteMic, reconnecting }: VoiceRoomNoticesProps) {
  const audioBlocked = useVoiceRoomStore((s) => s.audioBlocked);
  const muteRequestAt = useVoiceRoomStore((s) => s.muteRequestAt);
  const inviteSpeakAt = useVoiceRoomStore((s) => s.inviteSpeakAt);
  const patch = useVoiceRoomStore((s) => s.patch);

  return (
    <View className="gap-xs px-md pb-sm">
      {reconnecting ? <Alert description="Mất kết nối — đang nối lại…" tone="warning" /> : null}
      {audioBlocked ? <AudioBlockedNotice /> : null}
      {muteRequestAt !== null ? <MuteRequestPrompt onDismiss={() => patch({ muteRequestAt: null })} onMute={onMuteMic} /> : null}
      {inviteSpeakAt !== null && !audioBlocked ? (
        <InviteSpeakPrompt onDismiss={() => patch({ inviteSpeakAt: null })} onEnableMic={onEnableMic} />
      ) : null}
      {micDenied ? <Text className="text-center text-caption-sm text-fg-on-nav-muted">Chưa có quyền micro — bạn chỉ nghe được.</Text> : null}
    </View>
  );
}

import { Text, View } from 'react-native';

import { getCallMedia } from '@/core/media/call-media.registry';
import type { CallMediaParticipant } from '@/core/media/call-media.types';
import { Avatar } from '@/shared/ui/avatar';
import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import type { PomodoroParticipant } from '../api/pomodoro.types';

export interface ParticipantTileProps {
  /** Trạng thái media THẬT của người này (khớp `identity` LiveKit = userId); vắng khi chưa vào phòng (preview). */
  media?: CallMediaParticipant;
  participant: PomodoroParticipant;
  self: boolean;
}

function labelOf({ media, participant, self }: ParticipantTileProps): string {
  const parts = [self ? `${participant.name} (bạn)` : participant.name];
  if (participant.isHost) parts.push('chủ phòng');
  if (media?.micEnabled) parts.push('đang bật mic');
  if (media?.cameraEnabled) parts.push('đang bật camera');
  if (participant.goal) parts.push(`mục tiêu: ${participant.goal}`);
  return parts.join(', ');
}

/**
 * Ô một người trong lưới (app.md §3 "lưới người (avatar; camera nếu bật)"): ảnh đại diện — hoặc video khi họ bật camera —, tên, nhãn "Chủ phòng",
 * biểu tượng mic đang bật, mục tiêu (chỉ hiện khi người đó CHIA SẺ — server đã lọc). Viền đậm khi đang nói. Cả ô là MỘT phần tử trợ năng với nhãn
 * đọc đủ tên/vai trò/mic/mục tiêu.
 */
export function ParticipantTile(props: ParticipantTileProps) {
  const { media, participant, self } = props;
  const showVideo = Boolean(media?.cameraEnabled && media.videoRef);
  return (
    <View className="w-1/2 p-3xs tablet:w-1/3">
      <View
        accessibilityLabel={labelOf(props)}
        accessible
        className={cn(
          'items-center gap-2xs rounded-md border-hairline bg-bg-1 p-sm',
          media?.isSpeaking ? 'border-border-brand' : 'border-border-1',
        )}
      >
        <View className="h-16 w-16 items-center justify-center overflow-hidden rounded-full">
          {showVideo && media ? (
            getCallMedia().renderVideo(media.videoRef, { mirror: self, objectFit: 'cover' })
          ) : (
            <Avatar name={participant.name} size="lg" />
          )}
        </View>
        <Text className="text-center text-label-md font-semibold text-fg-1" numberOfLines={1}>
          {self ? `${participant.name} (bạn)` : participant.name}
        </Text>
        <View className="flex-row items-center gap-2xs">
          {participant.isHost ? (
            <Text className="text-caption-sm font-semibold text-fg-brand">Chủ phòng</Text>
          ) : null}
          {media?.micEnabled ? <Icon color="fg-2" name="mic-01" size="xs" /> : null}
        </View>
        {participant.goal ? (
          <Text className="text-center text-caption-lg text-fg-2" numberOfLines={2}>
            {participant.goal}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

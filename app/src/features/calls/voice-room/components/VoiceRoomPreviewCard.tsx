import { Text, View } from 'react-native';

import { AvatarGroup } from '@/shared/ui/avatar-group';
import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';

import type { VoicePreview } from '../api/voice-room.types';

const SHOWN_AVATARS = 6;

/**
 * Thẻ xem trước phòng (app.md §2): ai đang trong phòng, "3/8 chỗ", chủ phòng. Chỉ ĐỌC — không có nút nào ở đây; nút vào phòng ở
 * `JoinOptions`. Nhãn số người là CHỮ ("3 người đang trong phòng"), không chỉ dấu chấm/icon.
 *
 * Đầu thẻ có ô icon micro (tông `success` — "đang mở/có thể vào", khác tông `brand` của phòng chat); người trong phòng vẽ bằng
 * `AvatarGroup` (avatar chồng nhau + "+k") — cùng dáng "facepile" với dải cuộc gọi đang diễn ra.
 */
export function VoiceRoomPreviewCard({ preview }: { preview: VoicePreview }) {
  const { limits, participants, seatsLeft } = preview;
  const occupied = Math.max(0, limits.maxParticipants - seatsLeft);
  const summary =
    participants.length === 0
      ? 'Chưa có ai trong phòng'
      : `${String(participants.length)} người đang trong phòng`;
  const host = participants.find((p) => p.isHost);

  return (
    <Card className="gap-sm">
      <View className="flex-row items-center gap-sm">
        <IconTile name="mic-01" tone="success" />
        <Text className="flex-1 text-header-sm text-fg-1" numberOfLines={2}>
          {preview.channel.name}
        </Text>
        <Badge
          label={`${String(occupied)}/${String(limits.maxParticipants)} chỗ`}
          variant={seatsLeft === 0 ? 'warning' : 'neutral'}
        />
      </View>
      <Text accessibilityLiveRegion="polite" className="text-body-md text-fg-2">
        {summary}
        {host ? ` · Chủ phòng: ${host.name}` : ''}
      </Text>
      {participants.length > 0 ? (
        <AvatarGroup
          max={SHOWN_AVATARS}
          size="sm"
          users={participants.map((p) => ({ avatarUrl: p.avatarUrl, id: p.userId, name: p.name }))}
        />
      ) : (
        <Text className="text-body-md text-fg-2">
          Bấm “Tham gia” để bắt đầu — người vào đầu tiên là chủ phòng.
        </Text>
      )}
    </Card>
  );
}

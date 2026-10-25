import { useMemo } from 'react';
import { Text, View } from 'react-native';

import type { PomodoroParticipant } from '../api/pomodoro.types';
import { usePomodoroStore } from '../store/pomodoro.store';
import { ParticipantTile } from './ParticipantTile';

export interface PomodoroParticipantsProps {
  myId: string | undefined;
  participants: PomodoroParticipant[];
}

/**
 * Lưới người đang học. Danh sách + tên + mục tiêu chia sẻ đến từ SERVER (`snapshot.participants`); trạng thái mic/camera/đang nói lấy từ SDK media theo
 * `identity` (= userId). Chưa vào phòng (preview) thì `room.participants` rỗng — ô chỉ có avatar + tên.
 */
export function PomodoroParticipants({ myId, participants }: PomodoroParticipantsProps) {
  const media = usePomodoroStore((state) => state.room.participants);
  const byIdentity = useMemo(() => new Map(media.map((item) => [item.identity, item])), [media]);

  return (
    <View className="gap-xs">
      <Text className="text-label-md font-semibold text-fg-2">{`Đang học (${participants.length})`}</Text>
      {participants.length === 0 ? (
        <Text className="text-body-md text-fg-2">Chưa có ai trong phòng.</Text>
      ) : (
        <View className="flex-row flex-wrap">
          {participants.map((participant) => (
            <ParticipantTile
              key={participant.userId}
              media={byIdentity.get(participant.userId)}
              participant={participant}
              self={participant.userId === myId}
            />
          ))}
        </View>
      )}
    </View>
  );
}

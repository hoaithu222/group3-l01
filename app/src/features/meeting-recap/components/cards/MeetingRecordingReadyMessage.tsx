import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';

import { spokenDuration } from '../../utils/recording-format.utils';
import { openRecordingPlayer } from '../../utils/recap-navigation';
import type { MeetingSystemMessageProps } from './MeetingRecapMessage';

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/**
 * Thẻ tin hệ thống `MEETING_RECORDING_READY` (app.md §3 "Thẻ chat `MeetingRecordingReadyCard`"): "Bản ghi cuộc họp đã sẵn sàng · 45 phút"
 * + "Xem" (mở trình phát — quyền xem kiểm ở BE; bị xoá/hết hạn thì màn phát nói "không còn khả dụng"). Payload BE: `{ meetingId,
 * recordingId, durationSec }`. Đăng ký ở nơi lắp ráp (`app/(app)/_layout.tsx`) — `chat` không import feature này.
 */
export function MeetingRecordingReadyMessage({ message }: MeetingSystemMessageProps) {
  const p = message.systemPayload ?? {};
  const meetingId = str(p.meetingId);
  const recordingId = str(p.recordingId);
  const duration = typeof p.durationSec === 'number' && p.durationSec > 0 ? spokenDuration(p.durationSec) : '';

  return (
    <View className="mx-md my-2xs flex-row items-center gap-sm self-center rounded-md bg-surface-info p-sm">
      <Icon color="info" name="play" size="md" />
      <Text className="shrink text-label-md text-fg-1">
        {duration ? `Bản ghi cuộc họp đã sẵn sàng · ${duration}` : 'Bản ghi cuộc họp đã sẵn sàng'}
      </Text>
      {meetingId && recordingId ? (
        <Button iconLeft="play" label="Xem" size="sm" variant="secondary" onPress={() => openRecordingPlayer(meetingId, recordingId)} />
      ) : null}
    </View>
  );
}

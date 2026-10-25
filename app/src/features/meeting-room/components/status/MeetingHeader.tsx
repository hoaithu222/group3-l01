import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';

import type { RoomRecordingStatus } from '../../api/meeting-room.types';
import type { ConnectionQuality } from '../../media/meeting-media.types';
import { RecordingIndicator } from '../recording/RecordingIndicator';
import { LockedBadge } from './LockedBadge';
import { MeetingHeaderActions, type MeetingHeaderActionsProps } from './MeetingHeaderActions';
import { NetworkQualityBadge } from './NetworkQualityBadge';

export interface MeetingHeaderProps extends MeetingHeaderActionsProps {
  /** Thời lượng đã định dạng ("12:34" / "1:02:03") — tính bằng `elapsedSeconds` + `formatDuration` theo giờ server. */
  clock: string;
  locked: boolean;
  /** Vắng thì ẩn nút "Thu nhỏ" (chỉ bật khi có `MeetingRoomHost` mount để thanh nhỏ còn chỗ hiện). */
  onMinimize?: () => void;
  quality: ConnectionQuality;
  /** p2-06: trạng thái ghi hình của phòng — đang ghi thì nhãn đỏ "Đang ghi hình" LUÔN nằm ở dòng huy hiệu. */
  recordingStatus?: RoomRecordingStatus | null;
  title: string;
}

const isRecording = (status: RoomRecordingStatus | null | undefined): boolean =>
  status === 'STARTING' || status === 'RECORDING' || status === 'STOPPING';

/**
 * Thanh tiêu đề trong phòng (khuôn Meet/Teams): [Thu nhỏ] · tên cuộc họp (MỘT dòng) / đồng hồ + "Mạng yếu" · [✋ n] · Chat · Mọi người.
 * Dòng dưới CHỈ khi có: "Đang ghi hình" (p2-06, RR-19) và "Đã khoá".
 *
 *  · Huy hiệu mạng nằm CẠNH đồng hồ chứ không ở dòng riêng: chất lượng mạng đổi liên tục (tốt ↔ yếu vài giây một lần), một dòng hiện/ẩn
 *    theo nó là thanh cao/thấp ⇒ sân khấu co giãn, video nhảy. Ghi hình/khoá là trạng thái ÍT đổi nên được dòng riêng.
 *  · "Thu nhỏ" là nút chỉ-icon (mũi tên xuống, như Meet/Teams) — chữ đầy đủ "Thu nhỏ cuộc họp" ở câu đọc; nhường bề ngang cho tên.
 * ⛔ Nền `ink-10` + chữ trắng cố định ở cả hai theme (thanh nằm trên sân khấu video tối).
 */
export function MeetingHeader({ clock, locked, onMinimize, quality, recordingStatus, title, ...actions }: MeetingHeaderProps) {
  const showBadges = isRecording(recordingStatus) || locked;

  return (
    <View className="gap-2xs bg-ink-10 px-xs pb-2xs pt-3xs">
      <View className="min-h-12 flex-row items-center gap-xs">
        {onMinimize ? (
          <Button accessibilityLabel="Thu nhỏ cuộc họp" iconLeft="arrow-down-small" iconOnly size="sm" variant="white-secondary" onPress={onMinimize} />
        ) : null}
        <View className="flex-1 justify-center">
          <Text accessibilityRole="header" className="text-label-lg text-fg-on-nav" maxFontSizeMultiplier={1.3} numberOfLines={1}>
            {title}
          </Text>
          <View className="flex-row items-center gap-2xs overflow-hidden">
            <Text accessibilityLabel={`Thời lượng cuộc họp ${clock}`} className="text-caption-sm text-fg-on-nav-muted" maxFontSizeMultiplier={1.3}>
              {clock}
            </Text>
            <NetworkQualityBadge quality={quality} size="sm" />
          </View>
        </View>
        <MeetingHeaderActions {...actions} />
      </View>
      {showBadges ? (
        <View className="flex-row flex-wrap items-center gap-xs">
          <RecordingIndicator status={recordingStatus} />
          {locked ? <LockedBadge /> : null}
        </View>
      ) : null}
    </View>
  );
}

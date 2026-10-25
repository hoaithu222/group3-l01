import { Text, View } from 'react-native';

import { getCallMedia } from '@/core/media/call-media.registry';
import type { CallMediaParticipant } from '@/core/media/call-media.types';
import { Avatar } from '@/shared/ui/avatar';

import type { CallParticipantDto } from '../api/calls.types';

export interface CallParticipantTilesProps {
  /** Phòng thoại kênh (p2-03): chủ phòng — hiện nhãn "Chủ phòng" trên ô của họ. Vắng ở cuộc gọi RING. */
  hostId?: string | null;
  /** Người trong cuộc gọi theo SERVER (tên, avatar, trạng thái) — ghép với snapshot media theo `identity = userId`. */
  participants: CallParticipantDto[];
  /** Snapshot từ cổng media (người nói, mic/camera, ô video). */
  media: CallMediaParticipant[];
  meId: string | null;
}

/**
 * Lưới người trong cuộc gọi. Ô có video (`videoRef`) vẽ qua `getCallMedia().renderVideo` (cổng lo chi tiết SDK), còn lại
 * hiện avatar + tên + chỉ báo tắt mic/đang nói (chữ, không chỉ màu). Danh sách gốc là của SERVER: người chưa vào phòng
 * (đang đổ chuông) vẫn thấy tên với nhãn trạng thái.
 */
export function CallParticipantTiles({ hostId = null, media, meId, participants }: CallParticipantTilesProps) {
  const inRoom = participants.filter((p) => ['CONNECTED', 'JOINING', 'RECONNECTING', 'RINGING', 'INVITED'].includes(p.state));
  if (inRoom.length === 0) return null;

  return (
    <View className="flex-row flex-wrap justify-center gap-sm px-md">
      {inRoom.map((p) => {
        const live = media.find((m) => m.identity === p.userId);
        const video = live?.videoRef ? getCallMedia().renderVideo(live.videoRef, { mirror: p.userId === meId }) : null;
        const waiting = p.state === 'RINGING' || p.state === 'INVITED';
        const state = waiting ? 'Đang đổ chuông' : live && !live.micEnabled ? 'Đã tắt mic' : live?.isSpeaking ? 'Đang nói' : '';
        // Nhãn CHỮ (không chỉ icon/màu): chủ phòng · đang giơ tay · trạng thái mic — cũng là nội dung trình đọc màn hình đọc.
        const status = [p.userId === hostId ? 'Chủ phòng' : '', p.handRaisedAt ? 'Đang giơ tay' : '', state].filter(Boolean).join(' · ');
        return (
          <View
            key={p.userId}
            accessibilityLabel={`${p.name}${status ? `, ${status}` : ''}`}
            accessible
            className="h-32 w-28 items-center justify-center gap-2xs overflow-hidden rounded-md bg-bg-popup"
          >
            {video ?? <Avatar name={p.name} size="md" source={p.avatarUrl ? { uri: p.avatarUrl } : undefined} />}
            <Text className="px-2xs text-caption-sm text-fg-on-popup" numberOfLines={1}>
              {p.userId === meId ? 'Bạn' : p.name}
            </Text>
            {/* ⛔ KHÔNG `fg-on-nav-muted` — ô này nền `bg-bg-popup` (gần-trắng ở chế độ sáng), còn `fg-on-nav-muted` LUÔN
                trắng (cặp với nền LUÔN tối `nav-to` của cả màn, xem `CallScreenBackdrop`) ⇒ ở chế độ sáng chữ trắng
                tan vào ô gần-trắng, giống đúng lỗi đã vá ở nền toàn màn. `fg-on-popup` mới là màu ĐÚNG CẶP với nền
                popup này (tối ở sáng, sáng ở tối) — cùng token tên người dùng ở dòng trên. */}
            {status ? (
              <Text className="px-2xs text-center text-caption-sm text-fg-on-popup" numberOfLines={2}>
                {status}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

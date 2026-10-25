import { Text, View } from 'react-native';

import { getCallMedia } from '@/core/media/call-media.registry';
import type { CallMediaParticipant } from '@/core/media/call-media.types';

import type { CallParticipantDto } from '../api/calls.types';
import { CallParticipantTiles } from './CallParticipantTiles';

export interface CallStageProps {
  /** Phòng thoại kênh (p2-03) — truyền xuống `CallParticipantTiles`. */
  hostId?: string | null;
  /** Snapshot từ cổng media (người nói, mic/camera, ô video). */
  media: CallMediaParticipant[];
  meId: string | null;
  /** Người trong cuộc gọi theo SERVER (tên, avatar, trạng thái). */
  participants: CallParticipantDto[];
  /** Cuộc gọi VIDEO — quyết định có dựng sân khấu hay chỉ xếp ô. */
  video: boolean;
}

/**
 * Khu vực hình ảnh của cuộc gọi.
 *
 * ⛔ Vì sao tồn tại (lỗi đã sửa): trước đợt này MỌI cuộc gọi — kể cả video — đều vẽ bằng
 * `CallParticipantTiles`, tức khung 112×128dp xếp hàng ngang. Hai hậu quả:
 *  1. gọi video mà hình người kia chỉ to bằng con tem, không có ô tự xem (self-view);
 *  2. ô video thực tế **không hiện gì**: `renderVideo` trả về một `VideoTrack` có `flex: 1`
 *     đặt trong khung `items-center`, mà trục ngang của khung đó là `auto` còn `VideoTrack`
 *     không có kích thước nội tại ⇒ bề rộng tính ra **0**. Đúng triệu chứng "bật camera mà
 *     màn hình đen". `renderVideo` nay tự phủ kín khung cha (`livekit-call-media.ts`).
 *
 * Bố cục mới cho VIDEO: một ô LỚN chiếm hết chỗ (người kia), ô nhỏ góc trên phải là camera
 * của mình. Chưa ai bật camera ⇒ rơi về lưới ô như cũ (vẫn cần: lưới hiện cả người đang đổ
 * chuông chưa vào phòng).
 */
export function CallStage({ hostId = null, media, meId, participants, video }: CallStageProps) {
  const tiles = (
    <CallParticipantTiles hostId={hostId} media={media} meId={meId} participants={participants} />
  );
  if (!video) return tiles;

  const local = media.find((p) => p.isLocal) ?? null;
  const remote = media.find((p) => !p.isLocal && p.videoRef) ?? null;
  // Người kia chưa bật camera thì chính mình lên ô lớn — màn hình trống trơn còn khó hiểu hơn.
  const main = remote ?? (local?.videoRef ? local : null);
  if (!main) return tiles;

  // Ô nhỏ chỉ có nghĩa khi ô lớn là NGƯỜI KHÁC (ô lớn đã là mình thì không tự xem hai lần).
  const pip = main === remote && local?.videoRef ? local : null;
  const nameOf = (identity: string): string =>
    identity === meId ? 'Bạn' : (participants.find((p) => p.userId === identity)?.name ?? '');

  return (
    <View className="mx-md mb-md flex-1 overflow-hidden rounded-sm bg-bg-popup">
      {getCallMedia().renderVideo(main.videoRef, { mirror: main.isLocal, objectFit: 'cover' })}
      {pip ? (
        // Góc TRÊN phải: góc dưới đã là chỗ của tên người đang nói và thanh điều khiển.
        <View className="absolute right-sm top-sm h-36 w-24 overflow-hidden rounded-2xs bg-bg-popup">
          {getCallMedia().renderVideo(pip.videoRef, { mirror: true, objectFit: 'cover' })}
        </View>
      ) : null}
      {/* Nhãn CHỮ trên nền mờ — tên người đang chiếm ô lớn, cũng là thứ trình đọc màn hình đọc. */}
      <View className="absolute bottom-sm left-sm rounded-2xs bg-nav-to/80 px-xs py-3xs">
        <Text className="text-caption-sm text-fg-on-nav" numberOfLines={1}>
          {`${nameOf(main.identity)}${main.micEnabled ? '' : ' · Đã tắt mic'}`}
        </Text>
      </View>
    </View>
  );
}

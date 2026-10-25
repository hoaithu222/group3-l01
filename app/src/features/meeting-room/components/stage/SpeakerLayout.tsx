import { View } from 'react-native';

import { raisedHandOrder } from '../../utils/hand-queue.utils';
import type { RoomPerson } from '../../utils/room-people.utils';
import { ParticipantTile } from './ParticipantTile';
import type { RenderVideo } from './stage.types';
import { ThumbnailStrip } from './ThumbnailStrip';

export interface SpeakerLayoutProps {
  /** Thứ tự giơ tay của CẢ phòng (`MeetingStage` tính một lần). Thiếu (dùng lẻ) thì tự tính trên `people`. */
  handOrder?: ReadonlyMap<string, number>;
  /** Điện thoại nằm ngang: dải ô nhỏ thành cột bên phải thay vì hàng dưới. */
  landscape?: boolean;
  /** ⚠️ Hàm ổn định — ô được `memo`. */
  onLongPressTile: (userId: string) => void;
  /** Đã sắp bởi cha (`sortForStage`): người ĐƯỢC GHIM rồi tới người đang nói đứng đầu. */
  people: RoomPerson[];
  pinnedUserId: string | null;
  renderVideo: RenderVideo;
}

/**
 * Bố cục Diễn giả: MỘT người lớn chiếm sân khấu + dải ô nhỏ cho những người còn lại (dưới — hoặc bên phải khi nằm ngang).
 *
 * Người lớn = người được ghim (nếu còn trong phòng), không thì người đầu danh sách (người đang nói theo thứ tự của cha). Tìm theo
 * `pinnedUserId` thay vì tin `people[0]`: nếu cha sắp lệch (ghim người đã rời) thì vẫn không ai bị "ghim ma" chiếm sân khấu.
 */
export function SpeakerLayout({ handOrder, landscape = false, onLongPressTile, people, pinnedUserId, renderVideo }: SpeakerLayoutProps) {
  const main = people.find((person) => person.userId === pinnedUserId) ?? people[0];
  if (!main) return null;
  const others = people.filter((person) => person !== main);
  const order = handOrder ?? raisedHandOrder(people);

  return (
    <View className={landscape ? 'flex-1 flex-row' : 'flex-1'}>
      <View className="flex-1 p-xs">
        <ParticipantTile
          featured
          handOrder={order.get(main.userId)}
          person={main}
          pinned={main.userId === pinnedUserId}
          renderVideo={renderVideo}
          onLongPress={onLongPressTile}
        />
      </View>
      {others.length > 0 ? (
        <ThumbnailStrip
          handOrder={order}
          people={others}
          pinnedUserId={pinnedUserId}
          renderVideo={renderVideo}
          vertical={landscape}
          onLongPressTile={onLongPressTile}
        />
      ) : null}
    </View>
  );
}

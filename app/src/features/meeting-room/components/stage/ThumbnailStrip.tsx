import { FlatList } from 'react-native';

import { raisedHandOrder } from '../../utils/hand-queue.utils';
import type { RoomPerson } from '../../utils/room-people.utils';
import { ParticipantTile } from './ParticipantTile';
import type { RenderVideo } from './stage.types';

export interface ThumbnailStripProps {
  /** Thứ tự giơ tay của CẢ phòng (`MeetingStage` tính một lần). Thiếu thì tự tính trên `people` của dải. */
  handOrder?: ReadonlyMap<string, number>;
  /** ⚠️ Hàm ổn định — ô được `memo`. */
  onLongPressTile: (userId: string) => void;
  people: RoomPerson[];
  pinnedUserId: string | null;
  renderVideo: RenderVideo;
  /** Điện thoại nằm ngang: dải thành CỘT bên phải (chiều cao ngang quá thấp để chừa một hàng ô dưới nội dung chính). */
  vertical?: boolean;
}

/**
 * Dải ô nhỏ cuộn NGANG dưới sân khấu (hoặc DỌC bên phải khi nằm ngang) — dùng chung cho bố cục Diễn giả và khi có người chia sẻ màn hình.
 * Mỗi ô nhỏ vẫn có huy hiệu ✋ + số thứ tự và chip mic/đang nói (bằng hình) — ⛔ trước đây ô nhỏ chỉ hiện MỘT nhãn chữ nên tay giơ bị che.
 *
 * ⚠️ `flex-none` bắt buộc: `ScrollView` mặc định `flexGrow: 1`, trong cột/hàng nó sẽ giành chỗ trống với ô chính (`flex-1`) và ô chính
 * bị bóp lại. Cao (hoặc rộng) theo nội dung (ô `h-28 w-24`), không tự giãn.
 * ⚠️ `key` theo hướng: đổi `horizontal` của `FlatList` khi đang sống không được hỗ trợ — xoay máy thì dựng lại danh sách.
 */
export function ThumbnailStrip({ handOrder, onLongPressTile, people, pinnedUserId, renderVideo, vertical = false }: ThumbnailStripProps) {
  const order = handOrder ?? raisedHandOrder(people);

  return (
    <FlatList
      key={vertical ? 'thumbnail-strip-vertical' : 'thumbnail-strip-horizontal'}
      className="flex-none"
      contentContainerClassName="gap-xs p-xs"
      data={people}
      horizontal={!vertical}
      keyExtractor={(person) => person.userId}
      renderItem={({ item }) => (
        <ParticipantTile
          className="h-28 w-24 flex-none"
          compact
          handOrder={order.get(item.userId)}
          person={item}
          pinned={item.userId === pinnedUserId}
          renderVideo={renderVideo}
          onLongPress={onLongPressTile}
        />
      )}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      testID="thumbnail-strip"
    />
  );
}

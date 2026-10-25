import { View } from 'react-native';

import { raisedHandOrder } from '../../utils/hand-queue.utils';
import { gridColumns, paginate, type RoomPerson } from '../../utils/room-people.utils';
import { ParticipantTile } from './ParticipantTile';
import type { RenderVideo } from './stage.types';

export interface GridPageProps {
  /**
   * Thứ tự giơ tay của CẢ phòng (`raisedHandOrder`) do `MeetingStage` tính MỘT lần — số trên ô phải là thứ tự trong cả hàng đợi, không phải
   * trong riêng trang này. Thiếu (dùng lẻ) thì tự tính trong trang.
   */
  handOrder?: ReadonlyMap<string, number>;
  /** Điện thoại nằm ngang: hai người chia hai cột thay vì xếp dọc (`gridColumns`). */
  landscape: boolean;
  /** Nhấn giữ một ô — cha ghim/bỏ ghim. ⚠️ Hàm ổn định (ô được `memo`). */
  onLongPressTile: (userId: string) => void;
  /** CHỈ những người của TRANG này (cha đã cắt theo `pageSize`). */
  people: RoomPerson[];
  pinnedUserId: string | null;
  renderVideo: RenderVideo;
}

/**
 * MỘT trang lưới: số cột theo số ô của trang (1→1 · 2→1 dọc/2 ngang · 3–4→2 · 5–9→3), mọi ô chia đều chiều cao trang, khe 8dp giữa các
 * ô bo `rounded-md` (lưới kiểu Meet M3).
 *
 * ⚠️ Hàng cuối thiếu ô được chèn ô TRỐNG `flex-1` để các ô giữ nguyên kích thước — thiếu nó, ô lẻ cuối bị kéo giãn hết hàng và trông to gấp đôi
 * ô khác. Số hàng/ô do `gridColumns` quyết, không có số cứng nào ở đây (tablet 3×3 chỉ là `pageSize` = 9 từ cha).
 */
export function GridPage({ handOrder, landscape, onLongPressTile, people, pinnedUserId, renderVideo }: GridPageProps) {
  const columns = gridColumns(people.length, landscape);
  const rows = paginate(people, columns);
  const order = handOrder ?? raisedHandOrder(people);

  return (
    <View className="flex-1 gap-xs p-xs">
      {rows.map((row) => (
        <View key={row[0]?.userId} className="flex-1 flex-row gap-xs" testID="grid-row">
          {row.map((person) => (
            <ParticipantTile
              key={person.userId}
              featured={people.length === 1}
              handOrder={order.get(person.userId)}
              person={person}
              pinned={person.userId === pinnedUserId}
              renderVideo={renderVideo}
              onLongPress={onLongPressTile}
            />
          ))}
          {Array.from({ length: columns - row.length }, (_, index) => (
            <View key={`empty-${String(index)}`} className="flex-1" />
          ))}
        </View>
      ))}
    </View>
  );
}

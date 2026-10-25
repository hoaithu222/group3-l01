import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import type { RoomPerson } from '../../utils/room-people.utils';
import { ParticipantTile } from './ParticipantTile';
import { SelfViewPip } from './SelfViewPip';
import type { RenderVideo } from './stage.types';
import type { PipBounds } from './usePipDrag';

export interface OneOnOneStageProps {
  /** Thứ tự giơ tay của cả phòng (`MeetingStage` tính một lần). */
  handOrder: ReadonlyMap<string, number>;
  /** Người MÌNH — vào khung tự xem nổi. */
  me: RoomPerson;
  /** ⚠️ Hàm ổn định — ô được `memo`. */
  onLongPressTile: (userId: string) => void;
  /** Người KIA — chiếm cả sân khấu. */
  other: RoomPerson;
  pinnedUserId: string | null;
  renderVideo: RenderVideo;
}

/**
 * Cuộc 1:1 (mình + ĐÚNG một người, không ai chia sẻ, bố cục Lưới) kiểu Meet/Zoom/Teams: người kia FULL sân khấu, mình là khung tự xem nổi
 * kéo được (`SelfViewPip`). ⛔ Trước đây lưới chia đôi màn dọc cho hai người — nửa màn là chính mình, nửa còn lại người kia bị bóp còn nửa.
 *
 * ⚠️ Vùng sân khấu đo bằng `onLayout` (giới hạn kéo + bốn góc); chưa đo thì khung tự xem vẫn đúng góc dưới-phải (neo theo mép phải/dưới).
 * Phép đo cùng kích thước giữ object cũ — `onLayout` bắn lại mỗi lần cha dựng lại khung, object mới là vẽ lại khung tự xem vô ích.
 */
export function OneOnOneStage({
  handOrder,
  me,
  onLongPressTile,
  other,
  pinnedUserId,
  renderVideo,
}: OneOnOneStageProps) {
  const [bounds, setBounds] = useState<PipBounds>({ height: 0, width: 0 });
  const onLayout = (event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    setBounds((prev) =>
      prev.height === height && prev.width === width ? prev : { height, width },
    );
  };

  return (
    <View className="flex-1 p-xs" testID="one-on-one-stage" onLayout={onLayout}>
      <ParticipantTile
        featured
        handOrder={handOrder.get(other.userId)}
        person={other}
        pinned={other.userId === pinnedUserId}
        renderVideo={renderVideo}
        onLongPress={onLongPressTile}
      />
      <SelfViewPip
        bounds={bounds}
        handOrder={handOrder.get(me.userId)}
        person={me}
        pinned={me.userId === pinnedUserId}
        renderVideo={renderVideo}
        onLongPress={onLongPressTile}
      />
    </View>
  );
}

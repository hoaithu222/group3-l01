import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/utils/style/cn';

import type { RoomPerson } from '../../utils/room-people.utils';
import { ParticipantTile } from './ParticipantTile';
import type { RenderVideo } from './stage.types';

export interface AloneStageProps {
  handOrder?: number;
  /** Điện thoại nằm ngang: ô của mình bên trái, lời nhắn + nút mời bên phải. */
  landscape: boolean;
  /** Thiếu thì ẩn nút "Mời người khác". */
  onInvite?: () => void;
  onLongPressTile: (userId: string) => void;
  /** Người duy nhất trong phòng (thường là MÌNH); `undefined` khi media chưa báo ai — chỉ còn lời nhắn. */
  person?: RoomPerson;
  pinned: boolean;
  renderVideo: RenderVideo;
}

/**
 * Chỉ có mình trong phòng (kiểu Meet "Bạn là người duy nhất ở đây"): ô của CHÍNH MÌNH (video hoặc avatar) + lời nhắn thân thiện + nút
 * "Mời người khác" (chia sẻ link họp — `onInvite` của cha).
 *
 * ⛔ Trước đây là `Card` + `EmptyState` nền THEO THEME giữa sân khấu tối (chế độ sáng ra tấm trắng lốp) và không thấy chính mình — người
 * dùng không biết camera/mic của mình đang thế nào. Giờ chữ dùng `fg-on-nav` trên nền `ink-10` cố định, nút biến thể `white`.
 */
export function AloneStage({
  handOrder,
  landscape,
  onInvite,
  onLongPressTile,
  person,
  pinned,
  renderVideo,
}: AloneStageProps) {
  return (
    <View className={cn('flex-1 gap-xs p-xs', landscape ? 'flex-row' : null)}>
      {person ? (
        <View className="flex-1">
          <ParticipantTile
            featured
            handOrder={handOrder}
            person={person}
            pinned={pinned}
            renderVideo={renderVideo}
            onLongPress={onLongPressTile}
          />
        </View>
      ) : null}
      <View
        className={cn(
          'items-center justify-center gap-xs px-md py-sm',
          landscape || !person ? 'flex-1' : null,
        )}
      >
        <Text
          accessibilityRole="header"
          className="text-center text-label-lg font-semibold text-fg-on-nav"
          maxFontSizeMultiplier={1.3}
        >
          Bạn đang là người duy nhất ở đây
        </Text>
        <Text className="text-center text-body-md text-fg-on-nav-muted" maxFontSizeMultiplier={1.3}>
          {onInvite
            ? 'Gửi liên kết cuộc họp để mời mọi người tham gia.'
            : 'Mọi người sẽ hiện ở đây khi tham gia cuộc họp.'}
        </Text>
        {onInvite ? (
          <Button
            iconLeft="user-add"
            label="Mời người khác"
            size="sm"
            variant="white"
            onPress={onInvite}
          />
        ) : null}
      </View>
    </View>
  );
}

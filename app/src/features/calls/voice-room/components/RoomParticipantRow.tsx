import { View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { ListItem } from '@/shared/ui/list';

import type { CallParticipantDto } from '../../api/calls.types';

export interface RoomParticipantRowProps {
  /** Kẻ ngăn dưới hàng — nơi gọi bỏ ở hàng CUỐI của mỗi nhóm (khe giữa hai nhóm đã tách chúng). */
  divider?: boolean;
  /** Thứ tự trong hàng đợi giơ tay (1 = giơ sớm nhất theo giờ server) — nói ra bằng chữ để TalkBack đọc được thứ tự. */
  handOrder?: number;
  isHost: boolean;
  isMe: boolean;
  /** Chỉ chủ phòng, và không phải hàng của chính mình — nút ⋯ mở menu điều khiển. */
  onOpenMenu?: (participant: CallParticipantDto) => void;
  participant: CallParticipantDto;
}

/**
 * Một người trong phòng: avatar · tên · nhãn CHỮ (chủ phòng, đang giơ tay, bị chặn mic, đang chia sẻ). Hàng KHÔNG bấm được; ⋯ là nút riêng.
 * `emphasis="title"`: tên là TIÊU ĐỀ của hàng (chữ chính) còn dòng nhãn trạng thái mới là chữ phụ — để mặc định thì hai tầng cùng màu xám.
 */
export function RoomParticipantRow({
  divider,
  handOrder,
  isHost,
  isMe,
  onOpenMenu,
  participant,
}: RoomParticipantRowProps) {
  const tags = [
    isHost ? 'Chủ phòng' : '',
    participant.handRaisedAt
      ? handOrder
        ? `Giơ tay thứ ${String(handOrder)}`
        : 'Đang giơ tay'
      : '',
    participant.mutedByHost ? 'Đã chặn phát biểu' : '',
    participant.screenSharing ? 'Đang chia sẻ màn hình' : '',
    participant.state === 'JOINING' ? 'Đang vào…' : '',
  ].filter(Boolean);
  return (
    <ListItem
      description={tags.length > 0 ? tags.join(' · ') : undefined}
      divider={divider}
      emphasis="title"
      label={isMe ? `${participant.name} (Bạn)` : participant.name || 'Thành viên'}
      labelNumberOfLines={2}
      leading={
        // Trang trí: tên đã nằm ở nhãn hàng ⇒ ẩn avatar khỏi trình đọc màn hình (không đọc tên hai lần).
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Avatar
            name={participant.name}
            size="sm"
            source={participant.avatarUrl ? { uri: participant.avatarUrl } : undefined}
          />
        </View>
      }
      trailing={
        onOpenMenu ? (
          <Button
            accessibilityLabel={`Điều khiển ${participant.name || 'thành viên'}`}
            iconLeft="more"
            iconOnly
            size="sm"
            variant="tertiary"
            onPress={() => onOpenMenu(participant)}
          />
        ) : undefined
      }
    />
  );
}

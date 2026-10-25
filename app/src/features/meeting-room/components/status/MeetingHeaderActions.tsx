import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Badge, BadgeAnchor } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';

import type { RoomRole } from '../../api/meeting-room.types';
import { isHostLikeRole } from '../controls/role.utils';
import { RaisedHandsPill } from './RaisedHandsPill';

export interface MeetingHeaderActionsProps {
  /** Tin nhắn chưa đọc của nhóm chat cuộc họp — huy hiệu trên nút Chat (0/vắng = không hiện). */
  chatBadge?: number;
  /** Số người đang chờ ở phòng chờ — CHỈ chủ trì/đồng chủ trì thấy (người thường có truyền vào cũng bị bỏ qua). */
  lobbyCount?: number;
  /** Vắng thì ẩn nút Chat. */
  onOpenChat?: () => void;
  /** Mở danh sách người — nút "Mọi người" VÀ viên "✋ n". Vắng thì ẩn cả hai. */
  onOpenParticipants?: () => void;
  participantCount?: number;
  /** Số người đang giơ tay — > 0 thì hiện viên "✋ n". */
  raisedHands?: number;
  role?: RoomRole;
}

/** Huy hiệu chỉ trang trí: nghĩa của nó đã nằm trong `accessibilityLabel` của nút, để lộ ra thì trình đọc màn hình đọc thêm một ô "3" vô nghĩa. */
const hidden = (node: ReactNode): ReactNode =>
  node ? (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {node}
    </View>
  ) : undefined;

/**
 * Cụm phải của thanh tiêu đề phòng họp (như Meet/Teams đặt ở trên): [✋ n] · Chat · Mọi người — nút tròn chỉ-icon 40dp (vùng chạm 44dp
 * nhờ `hitSlop` của `Button`), huy hiệu số ở góc. Chuyển từ thanh điều khiển lên đây để thanh đáy còn MỘT hàng.
 *
 *  · Nút "Mọi người": huy hiệu số người trong phòng (xanh, góc phải); chủ trì/đồng chủ trì thêm số người ĐANG CHỜ vào (cam, góc trái).
 *  · Câu đọc giữ NGUYÊN chữ của thanh cũ ("Mở chat…", "Danh sách người tham gia, N người…") — test và người dùng trình đọc màn hình quen.
 * ⛔ Biến thể `white-secondary` (viền + icon trắng): thanh tiêu đề nằm trên nền `ink-10` cố định ở cả hai theme.
 */
export function MeetingHeaderActions({
  chatBadge = 0,
  lobbyCount,
  onOpenChat,
  onOpenParticipants,
  participantCount = 0,
  raisedHands = 0,
  role,
}: MeetingHeaderActionsProps) {
  const waiting = isHostLikeRole(role) ? (lobbyCount ?? 0) : 0;
  const people = `Danh sách người tham gia, ${String(participantCount)} người`;

  return (
    <View className="flex-row items-center gap-xs">
      {onOpenParticipants ? (
        <RaisedHandsPill count={raisedHands} onPress={onOpenParticipants} />
      ) : null}
      {onOpenChat ? (
        <BadgeAnchor
          badge={hidden(chatBadge > 0 ? <Badge count={chatBadge} size="sm" /> : undefined)}
        >
          <Button
            accessibilityLabel={
              chatBadge > 0 ? `Mở chat, ${String(chatBadge)} tin nhắn chưa đọc` : 'Mở chat'
            }
            iconLeft="chat-bubble"
            iconOnly
            size="sm"
            variant="white-secondary"
            onPress={onOpenChat}
          />
        </BadgeAnchor>
      ) : null}
      {onOpenParticipants ? (
        <BadgeAnchor badge={hidden(<Badge count={participantCount} size="sm" variant="info" />)}>
          <BadgeAnchor
            badge={hidden(
              waiting > 0 ? <Badge count={waiting} size="sm" variant="warning" /> : undefined,
            )}
            placement="top-left"
          >
            <Button
              accessibilityLabel={
                waiting > 0 ? `${people}, ${String(waiting)} người đang chờ vào` : people
              }
              iconLeft="contact-list"
              iconOnly
              size="sm"
              variant="white-secondary"
              onPress={onOpenParticipants}
            />
          </BadgeAnchor>
        </BadgeAnchor>
      ) : null}
    </View>
  );
}

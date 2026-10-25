import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';

import { ROLE_LABEL } from '../../constants/meeting-room.constants';
import type { RoomPerson } from '../../utils/room-people.utils';
import { HandGlyph } from '../hand/HandGlyph';

export interface ParticipantRowProps {
  /** Hiện nút "Tuỳ chọn" (menu chủ trì). Cha chỉ truyền `true` khi người xem quản lý được người này (không phải chính mình, không phải chủ trì). */
  canManage?: boolean;
  /** Thứ tự trong hàng đợi phát biểu (1 = giơ tay sớm nhất) — chỉ hàng của nhóm "Đang giơ tay". */
  handOrder?: number;
  /** Đây là NGƯỜI XEM — hiện "(Bạn)". */
  isMe: boolean;
  /** Đang gọi "Hạ tay" cho hàng này — nút quay + khoá. */
  lowering?: boolean;
  person: RoomPerson;
  /** Có ⇒ nút "Hạ tay": chủ trì/đồng chủ trì hạ tay người khác, hoặc chính mình tự hạ tay. */
  onLowerHand?: () => void;
  onOpenMenu?: () => void;
}

/**
 * Một hàng của `ParticipantsSheet` theo khuôn danh sách người của Meet: avatar (chấm xanh = đang nói), tên + "(Bạn)", huy hiệu vai trò, bàn tay
 * kèm SỐ THỨ TỰ hàng đợi, dòng trạng thái bằng CHỮ (đang nói · mic · camera · bị chủ trì tắt mic) — không trạng thái nào chỉ nằm ở màu.
 *
 * Phần thông tin là MỘT ô trợ năng đọc liền ("Lan, Đồng chủ trì, Đang giơ tay, thứ 1, Mic tắt, Camera bật"); nút "Hạ tay"/"Tuỳ chọn" là ô
 * rời đứng ngoài để lia tới và bấm được (gộp cả hàng thành một ô sẽ nuốt mất nút).
 */
export function ParticipantRow({
  canManage = false,
  handOrder,
  isMe,
  lowering = false,
  person,
  onLowerHand,
  onOpenMenu,
}: ParticipantRowProps) {
  const role = ROLE_LABEL[person.role];
  const mic = person.micEnabled ? 'Mic bật' : 'Mic tắt';
  const camera = person.cameraEnabled ? 'Camera bật' : 'Camera tắt';
  const raised = person.handRaisedAt !== null;
  const notes = [
    isMe ? 'Bạn' : '',
    role,
    raised ? (handOrder ? `Đang giơ tay, thứ ${String(handOrder)}` : 'Đang giơ tay') : '',
    person.isSpeaking ? 'Đang nói' : '',
    person.mutedByHost ? 'Đã bị chủ trì tắt mic' : '',
  ].filter(Boolean);

  return (
    <View className="min-h-14 flex-row items-center gap-xs py-2xs">
      <View
        accessibilityLabel={[person.name, ...notes, mic, camera].join(', ')}
        accessible
        className="flex-1 flex-row items-center gap-sm"
      >
        {/* Chấm xanh ở góc avatar = ĐANG NÓI (mốc nhìn nhanh khi danh sách dài); chữ "Đang nói" ở dòng dưới mang nghĩa đầy đủ. */}
        <Avatar badge={person.isSpeaking ? 'success' : undefined} name={person.name} size="sm" />
        <View className="flex-1 gap-3xs">
          <View className="flex-row items-center gap-2xs">
            <Text className="shrink text-body-md font-medium text-fg-1" numberOfLines={1}>
              {person.name}
            </Text>
            {isMe ? <Text className="text-body-md text-fg-2">(Bạn)</Text> : null}
            {role ? (
              <Badge label={role} size="sm" variant={person.role === 'HOST' ? 'brand' : 'info'} />
            ) : null}
            {raised ? (
              // Bàn tay + số thứ tự — cùng số với ô sân khấu (`raisedHandOrder`); nghĩa đã nằm trong nhãn trợ năng của hàng.
              <View className="flex-row items-center gap-3xs rounded-full bg-surface-warning px-2xs">
                <HandGlyph size="sm" />
                {handOrder ? (
                  <Text className="text-label-sm font-semibold text-fg-1">{String(handOrder)}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
          <View className="flex-row flex-wrap items-center gap-x-sm gap-y-3xs">
            {person.isSpeaking ? (
              <Text className="text-caption-sm font-medium text-fg-1">Đang nói</Text>
            ) : null}
            <View className="flex-row items-center gap-3xs">
              <Icon color={person.micEnabled ? 'success' : 'error'} name="mic-01" size="sm" />
              <Text className="text-caption-sm text-fg-2">{mic}</Text>
            </View>
            <View className="flex-row items-center gap-3xs">
              <Icon
                color={person.cameraEnabled ? 'success' : 'fg-2'}
                name="video-camera"
                size="sm"
              />
              <Text className="text-caption-sm text-fg-2">{camera}</Text>
            </View>
            {person.mutedByHost ? (
              <Text className="text-caption-sm text-fg-2">Chủ trì đã tắt mic</Text>
            ) : null}
          </View>
        </View>
      </View>
      {onLowerHand ? (
        <Button
          accessibilityLabel={isMe ? 'Hạ tay của bạn' : `Hạ tay của ${person.name}`}
          label="Hạ tay"
          loading={lowering}
          size="xs"
          variant="secondary"
          onPress={onLowerHand}
        />
      ) : null}
      {canManage && onOpenMenu ? (
        <Button
          accessibilityLabel={`Tuỳ chọn cho ${person.name}`}
          iconLeft="more"
          iconOnly
          size="xs"
          variant="tertiary"
          onPress={onOpenMenu}
        />
      ) : null}
    </View>
  );
}

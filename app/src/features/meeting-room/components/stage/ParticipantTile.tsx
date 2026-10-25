import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

import { ROLE_LABEL } from '../../constants/meeting-room.constants';
import type { RoomPerson } from '../../utils/room-people.utils';
import { personDisplayName, tileAccessibilityLabel } from './participant-label.utils';
import type { RenderVideo } from './stage.types';
import { sameTileProps } from './tile-equality.utils';
import { TileFooter } from './TileFooter';
import { TileHandBadge } from './TileHandBadge';
import { TileMedia } from './TileMedia';

export interface ParticipantTileProps {
  /** Lớp thêm cho ô (kích thước do cha quyết: `flex-1` trong lưới, `h-28 w-24 flex-none` ở dải thumbnail). */
  className?: string;
  /** Ô nhỏ (dải thumbnail, khung tự xem): bo `rounded-sm`, avatar nhỏ, chip trạng thái chỉ còn hình. */
  compact?: boolean;
  /** Ô "sân khấu" (người lớn của Diễn giả, người kia của cuộc 1:1, chỉ có mình): avatar lớn nhất. */
  featured?: boolean;
  /** Thứ tự giơ tay 1..n — cha tính MỘT lần cho cả sân khấu (`raisedHandOrder`) rồi truyền SỐ xuống (giữ `memo` có tác dụng). */
  handOrder?: number;
  /** Nhấn giữ — cha dùng để ghim/bỏ ghim (cục bộ). ⚠️ Truyền hàm có danh tính ỔN ĐỊNH, không thì `memo` vô dụng. */
  onLongPress?: (userId: string) => void;
  onPress?: (userId: string) => void;
  person: RoomPerson;
  pinned?: boolean;
  renderVideo: RenderVideo;
}

/** Viền ô: ĐANG NÓI (xanh) thắng GIƠ TAY (vàng) — màu không bao giờ là dấu hiệu duy nhất (chip "Đang nói", huy hiệu ✋, nhãn trợ năng). */
function ringClass(person: RoomPerson): string {
  if (person.isSpeaking) return 'border-action-success';
  return person.handRaisedAt ? 'border-action-accent' : 'border-transparent';
}

function ParticipantTileBase({
  className,
  compact = false,
  featured = false,
  handOrder,
  onLongPress,
  onPress,
  person,
  pinned = false,
  renderVideo,
}: ParticipantTileProps) {
  const raised = Boolean(person.handRaisedAt);
  const showPinned = pinned && !compact;
  const interactive = Boolean(onLongPress ?? onPress);

  return (
    <Pressable
      accessibilityHint={onLongPress ? (pinned ? 'Nhấn giữ để bỏ ghim' : 'Nhấn giữ để ghim') : undefined}
      accessibilityLabel={tileAccessibilityLabel(person, pinned, handOrder)}
      accessibilityRole={interactive ? 'button' : undefined}
      className={cn(
        'min-h-20 flex-1 overflow-hidden border-thick bg-ink-5',
        compact ? 'rounded-sm' : 'rounded-md',
        ringClass(person),
        className,
      )}
      onLongPress={onLongPress ? () => onLongPress(person.userId) : undefined}
      onPress={onPress ? () => onPress(person.userId) : undefined}
    >
      <TileMedia
        avatarSize={compact ? 'md' : featured ? '2xl' : 'xl'}
        mirror={person.isLocal}
        name={person.name}
        renderVideo={renderVideo}
        speaking={!person.videoRef && person.isSpeaking}
        videoRef={person.videoRef}
      />
      <TileFooter
        compact={compact}
        micOff={!person.micEnabled}
        name={personDisplayName(person)}
        role={ROLE_LABEL[person.role] || undefined}
        speaking={person.isSpeaking}
      />
      {raised || showPinned ? (
        <View
          className={cn('absolute inset-x-0 top-0 flex-row items-start justify-between gap-2xs', compact ? 'p-2xs' : 'p-xs')}
          pointerEvents="none"
        >
          {raised ? <TileHandBadge order={handOrder} /> : <View />}
          {showPinned ? (
            <View className="rounded-full bg-overlay px-xs py-3xs">
              <Text className="text-caption-sm text-fg-on-nav" maxFontSizeMultiplier={1.3} numberOfLines={1}>
                Đã ghim
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Ô MỘT người trong phòng (kiểu Google Meet M3): video hoặc avatar lớn trên quầng sáng, tên + chip trạng thái ở đáy trên scrim tối, huy
 * hiệu ✋ + số thứ tự ở góc trên-trái (MỌI cỡ ô), "Đã ghim" ở góc trên-phải (ô lớn).
 *
 * ⚠️ Tự dựng bằng `Pressable` chứ không dùng `Button`: ô KHÔNG phải nút mà là một KHUNG VIDEO chiếm cả ô, cần cử chỉ nhấn giữ (ghim/bỏ
 * ghim) — bộ chung không có control nào như vậy. Ô chỉ bấm được khi cha truyền `onLongPress`/`onPress`; ô nhỏ nhất ≥ 80dp ≫ 44dp.
 * ✅ Người đang nói: VIỀN xanh + chip "Đang nói" (ba vạch nhịp) + có trong `accessibilityLabel` (viền không phải dấu hiệu duy nhất — app.md §7).
 * ✅ `memo` (`sameTileProps`): snapshot media bắn dồn dập (người nói, chất lượng mạng) và dựng `RoomPerson` MỚI mỗi lần — ô chỉ vẽ lại khi
 *    thứ NHÌN THẤY đổi. Cha phải truyền callback ổn định (`useLatestCallback`) và SỐ thứ tự giơ tay (không truyền Map/object nội tuyến).
 * ⛔ Nền ô (`bg-ink-5`) và chữ trắng cố định ở CẢ HAI theme: video luôn nằm trên nền tối, dùng `bg-bg-*` thì chế độ sáng ra ô trắng chữ trắng.
 */
export const ParticipantTile = memo(ParticipantTileBase, sameTileProps);

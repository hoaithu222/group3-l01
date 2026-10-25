import { Pressable, Text, View } from 'react-native';

import { formatDateTime } from '@/shared/utils/format/date.utils';
import { cn } from '@/shared/utils/style/cn';
import { Avatar } from '@/shared/ui/avatar';
import { AvatarGroup } from '@/shared/ui/avatar-group';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';

import type { CallHistoryItem as HistoryItem } from '../api/calls.types';
import { normalizeOutcome, outcomeLabel } from '../utils/call-outcome';

export interface CallHistoryItemProps {
  item: HistoryItem;
  onCallBack: (item: HistoryItem) => void;
  onOpen: (item: HistoryItem) => void;
}

/**
 * Một dòng lịch sử (app.md p2-01 §3): avatar, tên hội thoại/kênh, mũi tên đi/đến, kết quả theo GÓC NHÌN người xem, thời điểm,
 * nút gọi lại. Cuộc gọi NHỠ vẽ mũi tên đỏ VÀ chữ "nhỡ" — màu không phải tín hiệu duy nhất (trợ năng). Hội thoại không còn
 * khả dụng (BE trả tên rỗng) chỉ hiện nhãn, không nút gọi.
 *
 * Cuộc gọi NHÓM/kênh/họp: thêm hàng avatar chồng nhau của người tham gia (`participantsPreview` — dữ liệu đã có sẵn trong dòng lịch
 * sử, trước đây không vẽ) để thấy ngay "gọi với ai". `active:opacity-70`: vùng chạm là `Pressable` tự dựng nên tự lo phản hồi nhấn.
 */
export function CallHistoryItem({ item, onCallBack, onOpen }: CallHistoryItemProps) {
  const outgoing = item.direction === 'OUTGOING';
  const label = outcomeLabel(
    normalizeOutcome(item.outcome),
    item.direction,
    item.mediaKind,
    item.durationSec,
  );
  const gone = item.scope.title.trim() === '';
  const title = gone ? 'Cuộc trò chuyện không còn khả dụng' : item.scope.title;
  const when = formatDateTime(item.startedAt);
  const a11y = `${title}. ${label.text}. ${when}`;
  // Tông theo loại: nhỡ = đỏ, gọi đi = xanh lá, gọi đến = xanh dương. ⚠️ Màu chỉ để quét nhanh — hướng mũi tên và chữ
  // "nhỡ"/"đi"/"đến" ở `label.text` vẫn là dấu hiệu chính (không để màu là tín hiệu duy nhất).
  const ink = label.missed ? 'error' : outgoing ? 'success' : 'info';
  const participants = item.scope.kind === 'DIRECT' ? [] : item.participantsPreview;

  return (
    <View className="flex-row items-center gap-sm px-md py-sm">
      <Pressable
        accessibilityLabel={a11y}
        accessibilityRole="button"
        className="min-h-11 flex-1 flex-row items-center gap-sm active:opacity-70"
        disabled={gone}
        onPress={() => onOpen(item)}
      >
        <Avatar
          name={title}
          size="lg"
          source={item.scope.avatarUrl ? { uri: item.scope.avatarUrl } : undefined}
        />
        <View className="flex-1 gap-3xs">
          <Text
            className={cn('text-label-md font-semibold', label.missed ? 'text-error' : 'text-fg-1')}
            numberOfLines={1}
          >
            {title}
          </Text>
          <View className="flex-row items-center gap-3xs">
            <Icon
              color={ink}
              name={outgoing ? 'arrow-up-small' : 'arrow-down-small'}
              size={16}
              variant="twotone"
            />
            <Text
              className={cn('flex-1 text-caption-sm', label.missed ? 'text-error' : 'text-fg-2')}
              numberOfLines={1}
            >
              {label.text}
            </Text>
          </View>
          {participants.length > 1 ? <AvatarGroup max={4} size="xs" users={participants} /> : null}
        </View>
        <Text className="text-caption-sm text-fg-2">{when}</Text>
      </Pressable>
      {gone ? null : (
        <Button
          accessibilityLabel={`Gọi lại ${title}`}
          iconLeft={item.mediaKind === 'VIDEO' ? 'video-camera' : 'phone'}
          iconOnly
          size="sm"
          variant="tertiary"
          onPress={() => onCallBack(item)}
        />
      )}
    </View>
  );
}

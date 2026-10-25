import { Pressable, Text, View } from 'react-native';

import { voiceActivityLabel } from '@/shared/calls';
import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { hapticTap } from '@/shared/utils/haptics';

import type { ChannelListItem as ChannelListItemData } from '../api';
import { CHANNEL_TYPE_ICON, CHANNEL_TYPE_TONE } from '../utils/channel-type-art';

export interface ChannelListItemProps {
  channel: ChannelListItemData;
  onLongPress?: (channel: ChannelListItemData) => void;
  onPress: (channel: ChannelListItemData) => void;
}

/**
 * Một dòng kênh (app.md §2, §7): icon loại + khoá riêng tư + tên + chấm chưa
 * đọc kèm SỐ (không chỉ màu — "chấm unread kèm số/nhãn a11y").
 *
 * `unreadCount`/`mentionCount` do màn cha gộp từ `/me/unread` (`withChannelUnread`) — BE không trả chúng ở danh sách kênh. Server đếm chạm
 * trần (`unreadCapped`) thì đọc "100+ tin chưa đọc" thay vì con số trần (Badge tự rút gọn hiển thị thành "99+").
 */
export function ChannelListItem({ channel, onLongPress, onPress }: ChannelListItemProps) {
  const unread = channel.unreadCount ?? 0;
  const mention = channel.mentionCount ?? 0;
  const unreadSpoken = channel.unreadCapped ? `${unread}+ tin chưa đọc` : `${unread} tin chưa đọc`;
  const spokenLabel = [
    channel.name,
    channel.visibility === 'PRIVATE' ? 'kênh riêng tư' : undefined,
    channel.status === 'ARCHIVED' ? 'đã lưu trữ' : undefined,
    channel.voice ? voiceActivityLabel(channel.voice.count) : undefined,
    mention > 0 ? `${mention} nhắc đến bạn` : unread > 0 ? unreadSpoken : undefined,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityLabel={spokenLabel}
      accessibilityRole="button"
      // `active:opacity-70`: phản hồi chạm (Pressable tự dựng không có trạng thái nhấn sẵn); nhấn giữ mở menu Ghim/Lên-xuống.
      className="flex-row items-center gap-sm px-md py-sm active:opacity-70"
      onLongPress={
        onLongPress
          ? () => {
              hapticTap(); // nhấn giữ đã "ăn" — menu sắp mở (cùng cảm giác menu ngữ cảnh của hệ điều hành)
              onLongPress(channel);
            }
          : undefined
      }
      onPress={() => onPress(channel)}
    >
      {/* Ô icon theo LOẠI kênh (chat = xanh dương, thoại = xanh lá, pomodoro = cam); kênh đã lưu trữ về xám. Trang trí:
          loại kênh vẫn nằm ở nhãn thoại/tên, không bắt trình đọc màn hình đọc thêm một "icon". */}
      <IconTile
        name={CHANNEL_TYPE_ICON[channel.type]}
        size="sm"
        tone={channel.status === 'ARCHIVED' ? 'neutral' : CHANNEL_TYPE_TONE[channel.type]}
      />

      <View className="flex-1 flex-row items-center gap-2xs">
        {channel.pinned ? <Icon color="warning" name="favorite" size={14} variant="bulk" /> : null}
        <Text
          className={channel.status === 'ARCHIVED' ? 'flex-shrink text-body-lg text-fg-2' : 'flex-shrink text-body-lg text-fg-1'}
          numberOfLines={1}
        >
          {channel.name}
        </Text>
        {/* `fg-2` chứ không `fg-3`: ổ khoá MANG NGHĨA (kênh riêng tư) nên cần ≥ 3:1 — `fg-3` chỉ 2.96:1 trên thẻ trắng. */}
        {channel.visibility === 'PRIVATE' ? <Icon color="fg-2" name="lock" size={14} /> : null}
        {/* Nhãn CHỮ, không chỉ icon/màu: "3 người đang trong phòng". */}
        {channel.voice ? (
          <Text className="text-caption-sm text-success" numberOfLines={1}>
            {voiceActivityLabel(channel.voice.count)}
          </Text>
        ) : null}
      </View>

      {mention > 0 ? (
        <Badge accessibilityLabel={`${mention} nhắc đến bạn`} count={mention} variant="error" />
      ) : unread > 0 ? (
        <Badge accessibilityLabel={unreadSpoken} count={unread} variant="neutral" />
      ) : null}
    </Pressable>
  );
}

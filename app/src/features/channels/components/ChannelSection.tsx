import { View } from 'react-native';

import { Section } from '@/shared/ui/section';

import type { ChannelListItem as ChannelListItemData } from '../api';
import { ChannelListItem } from './ChannelListItem';

export interface ChannelSectionProps {
  channels: ChannelListItemData[];
  onLongPressChannel?: (channel: ChannelListItemData) => void;
  onPressChannel: (channel: ChannelListItemData) => void;
  title: string;
}

/** "Kênh của bạn" / "Khám phá" (app.md §2) — rỗng thì KHÔNG vẽ gì, màn cha tự quyết định. */
export function ChannelSection({ channels, onLongPressChannel, onPressChannel, title }: ChannelSectionProps) {
  if (channels.length === 0) return null;

  return (
    <Section title={title}>
      {/* `-mx-md`: màn cha (`Screen` mặc định `padded`) đã cho lề 16, mà mỗi `ChannelListItem` lại tự có `px-md` ⇒ icon kênh
          thụt vào 32dp so với tiêu đề nhóm và ô tìm (thấy trên máy thật). Kéo hàng ra hết bề ngang: chữ thẳng cột 16 với tiêu đề,
          và vùng chạm/nền nhấn của hàng chạy hết mép như mọi danh sách hàng khác. */}
      <View className="-mx-md gap-3xs">
        {channels.map((channel) => (
          <ChannelListItem
            key={channel.id}
            channel={channel}
            onLongPress={onLongPressChannel}
            onPress={onPressChannel}
          />
        ))}
      </View>
    </Section>
  );
}

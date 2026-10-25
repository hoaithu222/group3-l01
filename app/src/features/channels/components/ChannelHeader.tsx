import { router } from 'expo-router';
import { View } from 'react-native';

import { ActionMenu } from '@/shared/ui/action-menu';
import { Button } from '@/shared/ui/button';
import { AppBar } from '@/shared/ui/navigation';

import type { ChannelDetail } from '../api';
import { CHANNEL_TYPE_LABEL } from '../utils/channel-type-art';

export interface ChannelHeaderProps {
  channel: ChannelDetail;
  wsId: string;
}

type ChannelSubRoute =
  | '/workspaces/[wsId]/channels/[chId]/info'
  | '/workspaces/[wsId]/channels/[chId]/members'
  | '/workspaces/[wsId]/channels/[chId]/pins'
  | '/workspaces/[wsId]/channels/[chId]/search'
  | '/workspaces/[wsId]/channels/[chId]/threads';

/**
 * Tên + mô tả ngắn, MỘT icon Tìm và menu "⋯" (app.md §2). Bản vẽ `AppBar` chỉ có 2 khe phải: bản cũ nhét 4 nút 40dp
 * (~172dp) nên tiêu đề kênh bị cắt "…" từ máy ≤ 360dp. Nay giữ hành động THƯỜNG DÙNG NHẤT (Tìm) làm icon, phần còn lại
 * (Tin đã ghim · Luồng · Thành viên · Thông tin) vào `ActionMenu` — cùng thứ tự và cùng nhãn với menu của `ConversationHeader`
 * (hội thoại 1-1/nhóm; riêng "Luồng" chỉ kênh mới có), để người dùng tìm thấy chúng ở cùng một chỗ ở cả hai loại phòng chat.
 * Tìm và Ghim (p1-09) chỉ ĐẨY ROUTE `search.tsx`/`pins.tsx` (màn thuộc feature `discovery` — `channels` không import nó,
 * nối bằng đường dẫn typed). "Luồng" (p1-06, `threads.tsx` → `threads/ChannelThreadsScreen`) cùng cách và CHỈ có ở kênh chữ (`TEXT`): luồng là tin trả lời của tin trong kênh chat,
 * kênh thoại/Pomodoro dùng chung header này nhưng không có danh sách luồng để xem.
 */
export function ChannelHeader({ channel, wsId }: ChannelHeaderProps) {
  const open = (pathname: ChannelSubRoute) => () => router.push({ params: { chId: channel.id, wsId }, pathname });

  return (
    <AppBar
      actions={
        <View className="flex-row items-center gap-2xs">
          <Button
            accessibilityLabel="Tìm trong kênh"
            iconLeft="search"
            iconOnly
            size="sm"
            variant="tertiary"
            onPress={open('/workspaces/[wsId]/channels/[chId]/search')}
          />
          <ActionMenu
            accessibilityLabel="Thêm tuỳ chọn của kênh"
            items={[
              { key: 'pins', icon: 'location', label: 'Tin đã ghim', onPress: open('/workspaces/[wsId]/channels/[chId]/pins') },
              {
                key: 'threads',
                hidden: channel.type !== 'TEXT',
                icon: 'chat-bubble',
                label: 'Luồng',
                onPress: open('/workspaces/[wsId]/channels/[chId]/threads'),
              },
              { key: 'members', icon: 'user', label: 'Thành viên', onPress: open('/workspaces/[wsId]/channels/[chId]/members') },
              { key: 'info', icon: 'alert-information', label: 'Thông tin kênh', onPress: open('/workspaces/[wsId]/channels/[chId]/info') },
            ]}
            title={channel.name}
          />
        </View>
      }
      subtitle={channel.description || CHANNEL_TYPE_LABEL[channel.type]}
      title={channel.name}
      onBack={router.back}
    />
  );
}

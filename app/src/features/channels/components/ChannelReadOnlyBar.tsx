import { Text, View } from 'react-native';

import { Divider } from '@/shared/ui/divider';
import { Icon } from '@/shared/ui/icon';

export type ReadOnlyReason = 'ADMINS_ONLY' | 'CHANNEL_ARCHIVED' | 'WORKSPACE_ARCHIVED';

const MESSAGE: Record<ReadOnlyReason, string> = {
  ADMINS_ONLY: 'Chỉ quản trị viên được đăng bài trong kênh này.',
  CHANNEL_ARCHIVED: 'Kênh đã lưu trữ — chỉ đọc.',
  WORKSPACE_ARCHIVED: 'Nhóm đã lưu trữ — chỉ đọc.',
};

export interface ChannelReadOnlyBarProps {
  reason: ReadOnlyReason;
}

/** Thay chỗ ô soạn tin khi `!myPermissions.canWrite` (app.md §2, §3: CH-06). */
export function ChannelReadOnlyBar({ reason }: ChannelReadOnlyBarProps) {
  return (
    <View>
      <Divider />
      <View className="flex-row items-center gap-xs bg-bg-1 px-md py-sm">
        {/* `fg-2`: ổ khoá MANG NGHĨA (vì sao không soạn được tin) nên cần ≥ 3:1 — `fg-3` chỉ 2.96:1 trên nền thẻ. */}
        <Icon color="fg-2" name="lock" size={16} />
        <Text className="flex-1 text-caption-sm text-fg-2">{MESSAGE[reason]}</Text>
      </View>
    </View>
  );
}

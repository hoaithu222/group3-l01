import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { InvitationPreview } from '../api';

export interface AcceptInvitationCardProps {
  /** Chưa đăng nhập: chỉ nhóm + người mời + gợi ý email (app.md p3-04 §3: "preview tối thiểu"). */
  minimal?: boolean;
  preview: InvitationPreview;
}

/**
 * Bản xem trước lời mời email. Đã đăng nhập thì thêm vai trò, kênh khách sẽ vào
 * và hạn (app.md §3). `emailHint` là email ĐÃ CHE ("l***@gmail.com"): người dùng
 * biết nên đăng nhập tài khoản nào mà không lộ địa chỉ đầy đủ cho người nhặt được
 * link (app.md §7).
 */
export function AcceptInvitationCard({ minimal = false, preview }: AcceptInvitationCardProps) {
  const isGuest = preview.role === 'GUEST';
  const channelNames = preview.channels?.map((channel) => channel.name) ?? [];

  return (
    <Card>
      <View className="items-center gap-sm py-sm">
        <Avatar
          name={preview.workspace.name}
          size="xl"
          source={preview.workspace.avatarUrl ? { uri: preview.workspace.avatarUrl } : undefined}
        />
        <Text className="text-center text-header-sm font-semibold text-fg-1">{preview.workspace.name}</Text>
        <Text className="text-caption-sm text-fg-2">Được mời bởi {preview.invitedBy.name}</Text>
        <Text className="text-center text-caption-sm text-fg-2">
          Lời mời gửi tới {preview.emailHint}. Hãy đăng nhập bằng đúng email này.
        </Text>

        {minimal ? null : (
          <View className="items-center gap-2xs">
            {/* Icon vai trò đứng TRƯỚC câu (khách = khiên, thành viên = người) — nghĩa vẫn nằm ở chữ, icon chỉ dẫn mắt. */}
            <View className="flex-row items-center gap-2xs">
              <Icon color={isGuest ? 'warning' : 'fg-brand'} name={isGuest ? 'shield-user' : 'user'} size="sm" />
              <Text className="text-body-md text-fg-1">
                {isGuest
                  ? `Vào với tư cách khách${preview.guestDays ? ` · ${preview.guestDays} ngày` : ''}`
                  : 'Vào với tư cách thành viên'}
              </Text>
            </View>
            {isGuest && channelNames.length > 0 ? (
              <Text className="text-center text-caption-sm text-fg-2">Kênh: {channelNames.join(', ')}</Text>
            ) : null}
            <View className="flex-row items-center gap-2xs">
              <Icon color="fg-2" name="clock" size="xs" />
              <Text className="text-caption-sm text-fg-2">Hết hạn {formatDateTime(preview.expiresAt)}</Text>
            </View>
          </View>
        )}
      </View>
    </Card>
  );
}

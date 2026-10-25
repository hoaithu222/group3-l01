import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { InvitePreview } from '../api';

export interface InvitePreviewCardProps {
  preview: InvitePreview;
}

/**
 * Tên/ảnh nhóm, người mời, hạn (app.md p1-02 §3, `InviteLandingScreen`).
 *
 * Ảnh người mời (`inviter.avatarUrl`, BE đã gửi sẵn) hiện nhỏ cạnh tên — mặt quen giúp người nhận tin link hơn một dòng chữ.
 * ⚠️ Ảnh đó bị ẩn khỏi trình đọc màn hình: `Avatar` có `name` tự đọc tên, đứng cạnh câu "Được mời bởi …" là đọc tên HAI lần.
 */
export function InvitePreviewCard({ preview }: InvitePreviewCardProps) {
  return (
    <Card>
      <View className="items-center gap-sm py-sm">
        <Avatar
          name={preview.workspace.name}
          size="xl"
          source={preview.workspace.avatarUrl ? { uri: preview.workspace.avatarUrl } : undefined}
        />
        <View className="items-center gap-3xs">
          <Text className="text-center text-header-sm font-semibold text-fg-1">
            {preview.workspace.name}
          </Text>
          {preview.workspace.description ? (
            <Text className="text-center text-caption-sm text-fg-2" numberOfLines={2}>
              {preview.workspace.description}
            </Text>
          ) : null}
        </View>
        <View className="items-center gap-2xs">
          <View className="flex-row items-center gap-xs">
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Avatar
                name={preview.inviter.name}
                size="xs"
                source={preview.inviter.avatarUrl ? { uri: preview.inviter.avatarUrl } : undefined}
              />
            </View>
            <Text className="text-caption-sm text-fg-2">Được mời bởi {preview.inviter.name}</Text>
          </View>
          <View className="flex-row items-center gap-2xs">
            <Icon color="fg-2" name="clock" size="xs" />
            <Text className="text-caption-sm text-fg-2">
              Hết hạn {formatDateTime(preview.expiresAt)}
            </Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

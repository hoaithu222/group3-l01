import { Text, View } from 'react-native';

import { Badge, type BadgeVariant } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { IconTile } from '@/shared/ui/icon-tile';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { InviteRow as InviteRowData, InviteStatus } from '../api';

/** Trạng thái bằng huy hiệu có CHỮ — đang hoạt động `success`, mọi trạng thái đã hết `neutral` (không phải lỗi, chỉ là xong). */
const STATUS_VIEW: Record<InviteStatus, { badge: BadgeVariant; label: string }> = {
  ACTIVE: { badge: 'success', label: 'Đang hoạt động' },
  EXPIRED: { badge: 'neutral', label: 'Đã hết hạn' },
  EXHAUSTED: { badge: 'neutral', label: 'Đã hết lượt' },
  REVOKED: { badge: 'neutral', label: 'Đã thu hồi' },
};

export interface InviteRowProps {
  invite: InviteRowData;
  onRevoke: (invite: InviteRowData) => void;
  revoking?: boolean;
}

/**
 * Một link mời đang quản lý: prefix, lượt dùng, hạn, trạng thái CHỮ (huy hiệu), người tạo, thu hồi (app.md §2). Ô icon đổi tông
 * theo trạng thái (còn dùng được `brand`, đã hết `neutral`) để mắt tách hai nhóm trước khi đọc chữ.
 */
export function InviteRow({ invite, onRevoke, revoking = false }: InviteRowProps) {
  const canRevoke = invite.status === 'ACTIVE';
  const status = STATUS_VIEW[invite.status];

  return (
    <View className="flex-row items-center gap-sm border-b border-b-divider-1 px-md py-sm">
      <IconTile name="link" tone={canRevoke ? 'brand' : 'neutral'} />

      <View className="flex-1 gap-3xs">
        {/* Ký tự `•` không đọc lên được ⇒ nhãn trợ năng nói đủ nghĩa (`screen-layout.md`, mục "Che dữ liệu"). */}
        <Text
          accessibilityLabel={`Link mời bắt đầu bằng ${invite.tokenPrefix}`}
          className="text-label-md text-fg-1"
        >
          {invite.tokenPrefix}••••••
        </Text>
        {/* ⚠️ Hạn kèm GIỜ: link 1 giờ/24 giờ mà chỉ ghi ngày thì "hết hạn hôm nay" không nói được còn dùng tới lúc nào. */}
        <Text className="text-caption-sm text-fg-2">
          Đã dùng {invite.usesCount}/{invite.maxUses} lượt · hết hạn {formatDateTime(invite.expiresAt)}
        </Text>
        <View className="flex-row flex-wrap items-center gap-xs">
          <Badge label={status.label} size="sm" variant={status.badge} />
          <Text className="text-caption-sm text-fg-2">tạo bởi {invite.createdBy.name}</Text>
        </View>
      </View>

      {canRevoke ? (
        <Button
          accessibilityLabel={`Thu hồi link mời ${invite.tokenPrefix}`}
          iconLeft="unlink"
          iconOnly
          loading={revoking}
          size="sm"
          variant="tertiary"
          onPress={() => onRevoke(invite)}
        />
      ) : null}
    </View>
  );
}

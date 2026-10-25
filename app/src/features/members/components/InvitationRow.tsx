import { Text, View } from 'react-native';

import { ActionMenu } from '@/shared/ui/action-menu';
import { Badge, type BadgeVariant } from '@/shared/ui/badge';
import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { formatDate, formatDateTime } from '@/shared/utils/format/date.utils';

import type { InvitationDto, InvitationStatus } from '../api';

/**
 * Trạng thái = huy hiệu có CHỮ + ô icon cùng tông: đang chờ `info`, đã nhận `success` (thư đã tới tay), hết hiệu lực `neutral`
 * (không phải lỗi của ai, chỉ là đã xong). Màu chỉ phụ — chữ luôn có.
 */
const STATUS_VIEW: Record<
  InvitationStatus,
  { badge: BadgeVariant; icon: IconName; label: string; tone: IconTileTone }
> = {
  PENDING: { badge: 'info', icon: 'email', label: 'Đang chờ', tone: 'info' },
  ACCEPTED: { badge: 'success', icon: 'email-recieve', label: 'Đã nhận', tone: 'success' },
  REVOKED: { badge: 'neutral', icon: 'email', label: 'Đã thu hồi', tone: 'neutral' },
  EXPIRED: { badge: 'neutral', icon: 'email', label: 'Đã hết hạn', tone: 'neutral' },
};

export interface InvitationRowProps {
  invitation: InvitationDto;
  onResend: (invitation: InvitationDto) => void;
  onRevoke: (invitation: InvitationDto) => void;
  /** Đang gửi lại/thu hồi CHÍNH lời mời này — khoá cả hai nút. */
  busy?: boolean;
}

/**
 * Một lời mời email (app.md p3-04 §2): email ĐẦY ĐỦ (người mời thấy, §7), vai
 * trò, trạng thái bằng CHỮ, gửi lúc nào/mấy lần, và menu "⋯" (Gửi lại · Thu hồi) cho
 * lời mời còn chờ. Khách ghi thêm số ngày; hạn của lời mời (7 ngày) khác hạn của khách.
 *
 * Hai hành động nằm trong MỘT menu "⋯" thay vì hai nút viền [Gửi lại][Thu hồi] cạnh nhau ở MỖI dòng: danh sách N lời mời
 * đang chờ trước đây có 2N nút cùng độ nổi, và "Thu hồi" (không hoàn tác — link trong email chết ngay) nổi ngang "Gửi lại".
 * Thu hồi vẫn đi qua hộp thoại xác nhận ở màn cha.
 */
export function InvitationRow({ busy = false, invitation, onResend, onRevoke }: InvitationRowProps) {
  const isPending = invitation.status === 'PENDING';
  const roleText =
    invitation.role === 'GUEST'
      ? `Khách${invitation.guestDays ? ` · ${invitation.guestDays} ngày` : ''}`
      : 'Thành viên';

  const status = STATUS_VIEW[invitation.status];

  return (
    <View className="flex-row items-center gap-sm border-b border-b-divider-1 px-md py-sm">
      <IconTile name={status.icon} tone={status.tone} />
      <View className="flex-1 gap-3xs">
        <Text className="text-label-md text-fg-1" numberOfLines={1}>
          {invitation.email}
        </Text>
        <View className="flex-row flex-wrap items-center gap-xs">
          <Badge label={status.label} size="sm" variant={status.badge} />
          <Text className="text-caption-sm text-fg-2">{roleText}</Text>
        </View>
        <Text className="text-caption-sm text-fg-2">
          Gửi {formatDateTime(invitation.lastSentAt)}
          {invitation.sendCount > 1 ? ` · ${invitation.sendCount} lần` : ''}
          {isPending ? ` · hết hạn ${formatDate(invitation.expiresAt)}` : ''}
        </Text>
      </View>

      {isPending ? (
        <ActionMenu
          accessibilityLabel={`Tuỳ chọn cho lời mời tới ${invitation.email}`}
          items={[
            {
              disabled: busy,
              icon: 'email',
              key: 'resend',
              label: 'Gửi lại lời mời',
              onPress: () => onResend(invitation),
            },
            {
              disabled: busy,
              icon: 'unlink',
              key: 'revoke',
              label: 'Thu hồi lời mời',
              onPress: () => onRevoke(invitation),
              tone: 'danger',
            },
          ]}
          title={invitation.email}
        />
      ) : null}
    </View>
  );
}

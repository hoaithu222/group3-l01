import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { formatDate } from '@/shared/utils/format/date.utils';

import type { MyInvitationDto } from '../api';

export interface MyInvitationRowProps {
  invitation: MyInvitationDto;
  /** Đang chấp nhận CHÍNH lời mời này. */
  accepting?: boolean;
  /** Khoá nút khi có lời mời khác đang được xử lý hoặc mất mạng. */
  disabled?: boolean;
  /** Lỗi của lần chấp nhận gần nhất (hiện NGAY DƯỚI dòng — không toast tự tắt). */
  error?: string;
  onAccept: (invitation: MyInvitationDto) => void;
}

/**
 * Một lời mời gửi tới tài khoản của mình (app.md p3-04 — `GET /me/invitations`): nhóm, người mời, vai trò
 * (khách ghi số ngày), hạn lời mời và nút "Tham gia". Vai trò/trạng thái bằng CHỮ, không chỉ màu.
 */
export function MyInvitationRow({
  accepting = false,
  disabled = false,
  error,
  invitation,
  onAccept,
}: MyInvitationRowProps) {
  const roleText =
    invitation.role === 'GUEST'
      ? `Khách${invitation.guestDays ? ` · ${invitation.guestDays} ngày` : ''}`
      : 'Thành viên';

  return (
    <View className="gap-xs border-b border-b-divider-1 px-md py-sm">
      <View className="flex-row items-center gap-sm">
        <Avatar
          name={invitation.workspace.name}
          size="md"
          source={
            invitation.workspace.avatarUrl ? { uri: invitation.workspace.avatarUrl } : undefined
          }
        />
        <View className="flex-1 gap-3xs">
          <Text className="text-label-md text-fg-1" numberOfLines={1}>
            {invitation.workspace.name}
          </Text>
          <Text className="text-caption-sm text-fg-2">
            {invitation.inviter.name} mời bạn · {roleText}
          </Text>
          <Text className="text-caption-sm text-fg-2">
            Hết hạn {formatDate(invitation.expiresAt)}
          </Text>
        </View>
        <Button
          accessibilityLabel={`Tham gia nhóm ${invitation.workspace.name}`}
          disabled={disabled}
          label="Tham gia"
          loading={accepting}
          size="sm"
          onPress={() => onAccept(invitation)}
        />
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" className="text-caption-sm text-error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Badge, type BadgeVariant } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';

import type { MeetingAttendeeDto, MeetingAttendeeRole, MeetingRsvp } from '../../api/meetings.types';
import { RSVP_LABEL } from '../../constants/meetings.constants';

const ROLE_LABEL: Record<MeetingAttendeeRole, string> = {
  ATTENDEE: '',
  CO_HOST: 'Đồng chủ trì',
  HOST: 'Chủ trì',
};

/**
 * Tông huy hiệu phản hồi — màu chỉ PHỤ cho chữ ("Tham dự"/"Có thể"…): quét danh sách dài là thấy ai đã nhận lời. "Không tham dự"
 * để `neutral` chứ không `error`: từ chối một lời mời không phải lỗi, tô đỏ là báo động giả.
 */
const RSVP_VARIANT: Record<MeetingRsvp, BadgeVariant> = {
  ACCEPTED: 'success',
  DECLINED: 'neutral',
  PENDING: 'neutral',
  TENTATIVE: 'warning',
};

export interface AttendeeRowProps {
  attendee: MeetingAttendeeDto;
  /** Có ⇒ hiện nút "Tuỳ chọn" (menu vai trò/xoá) — nơi gọi chỉ truyền khi người xem có việc để làm với người này. */
  onMore?: () => void;
}

/**
 * Một hàng người tham dự: ảnh đại diện (`avatarUrl`, chữ viết tắt khi thiếu/lỗi), tên, vai trò (chữ), phản hồi RSVP (huy hiệu có chữ).
 * Gộp thành MỘT ô trợ năng, menu là nút riêng.
 */
export function AttendeeRow({ attendee, onMore }: AttendeeRowProps) {
  const role = ROLE_LABEL[attendee.role];
  const name = attendee.name || 'Thành viên';
  return (
    <View className="min-h-11 flex-row items-center gap-sm py-2xs">
      <View
        accessibilityLabel={`${name}${role ? `, ${role}` : ''}, ${RSVP_LABEL[attendee.rsvp]}`}
        accessible
        className="flex-1 flex-row items-center gap-sm"
      >
        <Avatar
          name={name}
          size="sm"
          source={attendee.avatarUrl ? { uri: attendee.avatarUrl } : undefined}
        />
        <View className="flex-1">
          <Text className="text-body-md text-fg-1" numberOfLines={1}>
            {name}
          </Text>
          {role ? <Text className="text-caption-sm text-fg-brand">{role}</Text> : null}
        </View>
        <Badge label={RSVP_LABEL[attendee.rsvp]} size="sm" variant={RSVP_VARIANT[attendee.rsvp]} />
      </View>
      {onMore ? (
        <Button
          accessibilityLabel={`Tuỳ chọn cho ${name}`}
          iconLeft="more"
          iconOnly
          size="sm"
          variant="tertiary"
          onPress={onMore}
        />
      ) : null}
    </View>
  );
}

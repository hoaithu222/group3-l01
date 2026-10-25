import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Badge, type BadgeVariant } from '@/shared/ui/badge';
import { EmptyState } from '@/shared/ui/empty-state';

import type { AttendeeLite } from '../../api/meeting-room.types';
import { ROLE_LABEL } from '../../constants/meeting-room.constants';

/** Phản hồi lời mời bằng CHỮ (cùng cách gọi với lịch họp p2-04) — không dựa vào màu/icon. */
const RSVP_LABEL: Record<AttendeeLite['rsvp'], string> = {
  ACCEPTED: 'Tham dự',
  DECLINED: 'Không tham dự',
  PENDING: 'Chưa phản hồi',
  TENTATIVE: 'Có thể',
};

/** Tông huy hiệu — cùng bảng với hàng người tham dự của lịch họp; "Không tham dự" trung tính (từ chối không phải lỗi). */
const RSVP_VARIANT: Record<AttendeeLite['rsvp'], BadgeVariant> = {
  ACCEPTED: 'success',
  DECLINED: 'neutral',
  PENDING: 'neutral',
  TENTATIVE: 'warning',
};

const SCHEDULE_ROLE: Record<AttendeeLite['role'], string> = {
  ATTENDEE: '',
  CO_HOST: ROLE_LABEL.CO_HOST,
  HOST: ROLE_LABEL.HOST,
};

export interface InvitedListProps {
  /** Người được mời CHƯA vào phòng — cha lọc bỏ những người đang có mặt. */
  invited: readonly AttendeeLite[];
}

/**
 * Tab "Được mời" của `ParticipantsSheet` (app.md p2-05 §3.2): người được mời mà chưa vào phòng, kèm phản hồi RSVP bằng chữ. Chỉ ĐỌC — mời
 * thêm/xoá người là việc của lịch họp (p2-04), không làm trong phòng.
 */
export function InvitedList({ invited }: InvitedListProps) {
  if (invited.length === 0) {
    return (
      <EmptyState
        description="Mọi người được mời đều đã vào phòng."
        icon="checkmark-circle"
        size="compact"
        tone="success"
      />
    );
  }

  return (
    <View>
      {invited.map((attendee) => {
        const role = SCHEDULE_ROLE[attendee.role];
        const name = attendee.name || 'Thành viên';
        return (
          <View
            key={attendee.userId}
            accessibilityLabel={`${name}${role ? `, ${role}` : ''}, ${RSVP_LABEL[attendee.rsvp]}`}
            accessible
            className="min-h-11 flex-row items-center gap-sm py-2xs"
          >
            <Avatar name={name} size="sm" source={attendee.avatarUrl ? { uri: attendee.avatarUrl } : undefined} />
            <View className="flex-1">
              <Text className="text-body-md text-fg-1" numberOfLines={1}>
                {name}
              </Text>
              {role ? <Text className="text-caption-sm text-fg-2">{role}</Text> : null}
            </View>
            <Badge label={RSVP_LABEL[attendee.rsvp]} size="sm" variant={RSVP_VARIANT[attendee.rsvp]} />
          </View>
        );
      })}
    </View>
  );
}

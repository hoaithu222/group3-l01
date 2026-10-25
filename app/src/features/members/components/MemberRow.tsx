import { Pressable, Text, View } from 'react-native';

import { usePresence } from '@/core/socket';
import { isMentorTag, MemberMentorTag } from '@/shared/mentor';
import { Avatar } from '@/shared/ui/avatar';
import { Badge, type BadgeVariant } from '@/shared/ui/badge';
import { PresenceDot } from '@/shared/ui/presence-dot';
import { formatGuestRemaining, getGuestRemaining } from '@/shared/utils/format/guest-expiry.utils';
import { cn } from '@/shared/utils/style/cn';
import { AttentionDot } from '@/shared/wellbeing';

import type { MemberRow as MemberRowData } from '../api';
import { GuestBadge } from './GuestBadge';

const ROLE_LABEL: Record<MemberRowData['role'], string> = {
  OWNER: 'Chủ nhóm',
  ADMIN: 'Quản trị viên',
  MEMBER: 'Thành viên',
  GUEST: 'Khách',
};

/** Vai trò có huy hiệu — cùng tông với thẻ nhóm ở danh sách nhóm (chủ nhóm `info`, quản trị `neutral`). */
const ROLE_BADGE: Partial<Record<MemberRowData['role'], BadgeVariant>> = {
  OWNER: 'info',
  ADMIN: 'neutral',
};

export interface MemberRowProps {
  /**
   * p7-03 (P1) — người này đã tự chia sẻ mức rủi ro sức khoẻ học tập với nhóm VÀ mức hiện tại là MEDIUM/HIGH (nơi gọi, `MemberListScreen`,
   * đã tự lọc: chỉ OWNER/ADMIN nhận được dữ liệu, LOW không đánh dấu). Vắng/`false` = không vẽ gì (mặc định — đa số màn hình gọi `MemberRow`
   * không truyền, ví dụ `MemberCardSheet`).
   */
  attention?: boolean;
  className?: string;
  member: MemberRowData;
  onPress: (member: MemberRowData) => void;
}

/**
 * Một dòng thành viên (app.md p1-02 §2): avatar + chấm hiện diện + tên + vai
 * trò bằng CHỮ (không chỉ màu — README §7 "vai trò hiển thị bằng chữ").
 *
 * Hiện diện đọc từ `usePresence` (store dùng chung, tự cập nhật qua
 * `presence:updated`) khi đã có ít nhất một lần cập nhật; trước đó dùng thẳng
 * `member.presence` từ REST — tránh chớp "Ngoại tuyến" cho một người đang online
 * chỉ vì socket chưa kịp bắn sự kiện đầu tiên của phiên này.
 */
export function MemberRow({ attention = false, className, member, onPress }: MemberRowProps) {
  const live = usePresence(member.userId);
  const presenceState = live.updatedAt > 0 ? live.state : member.presence;
  const name = member.displayName ?? member.name;
  const guestRemaining = member.role === 'GUEST' ? getGuestRemaining(member.expiresAt) : null;
  // p6-03: cố vấn là KHÁCH có nhãn `displayTag = "MENTOR"` — hiện "Cố vấn · còn N ngày" thay cho "Khách", cả trên màn lẫn khi đọc.
  const isMentor = isMentorTag(member.displayTag, member.role);
  const roleText = isMentor ? 'Cố vấn' : ROLE_LABEL[member.role];
  const spokenLabel = `${name}${member.isMe ? ', bạn' : ''}, ${roleText}${guestRemaining ? `, ${formatGuestRemaining(guestRemaining)}` : ''}${attention ? ', cần chú ý sức khoẻ học tập' : ''}`;

  return (
    // `active:opacity-70`: phản hồi chạm cho cả hàng (Pressable tự dựng, không có sẵn trạng thái nhấn).
    <Pressable
      accessible={false}
      className={cn('active:opacity-70', className)}
      onPress={() => onPress(member)}
    >
      <View
        accessibilityLabel={spokenLabel}
        accessibilityRole="button"
        accessible
        className="flex-row items-center gap-sm px-md py-sm"
      >
        <Avatar
          name={name}
          size="md"
          source={member.avatarUrl ? { uri: member.avatarUrl } : undefined}
        />

        <View className="flex-1 gap-3xs">
          <View className="flex-row items-center gap-2xs">
            <Text className="flex-shrink text-label-md text-fg-1" numberOfLines={1}>
              {name}
            </Text>
            {member.isMe ? <Text className="text-caption-sm text-fg-2">(Bạn)</Text> : null}
          </View>

          <View className="flex-row items-center gap-xs">
            {/* p3-04: khách hiện hạn ("Khách · còn N ngày") — BE chỉ gửi `expiresAt` cho OWNER/ADMIN. */}
            {isMentor ? (
              <MemberMentorTag expiresAt={member.expiresAt} />
            ) : member.role === 'GUEST' && member.expiresAt ? (
              <GuestBadge expiresAt={member.expiresAt} />
            ) : ROLE_BADGE[member.role] ? (
              // Chủ nhóm/quản trị nổi lên bằng huy hiệu (có CHỮ, màu chỉ phụ); "Thành viên"/"Khách" giữ chữ thường — đa số
              // hàng là thành viên, huy hiệu ở mọi hàng thì không hàng nào nổi.
              <Badge label={ROLE_LABEL[member.role]} size="sm" variant={ROLE_BADGE[member.role]} />
            ) : (
              <Text className="text-caption-sm text-fg-2">{ROLE_LABEL[member.role]}</Text>
            )}
            <PresenceDot state={presenceState} />
            {attention ? <AttentionDot /> : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

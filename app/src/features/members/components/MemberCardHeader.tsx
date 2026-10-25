import { Text, View } from 'react-native';

import { usePresence } from '@/core/socket';
import { isMentorTag, MemberMentorTag } from '@/shared/mentor';
import { Avatar } from '@/shared/ui/avatar';
import { PresenceDot } from '@/shared/ui/presence-dot';
import { formatDate } from '@/shared/utils/format/date.utils';

import type { MemberCard } from '../api';
import { GuestBadge } from './GuestBadge';
import { GuestManageRow } from './GuestManageRow';
import { MemberSkillBadges } from './MemberSkillBadges';

const ROLE_LABEL: Record<MemberCard['role'], string> = {
  OWNER: 'Chủ nhóm',
  ADMIN: 'Quản trị viên',
  MEMBER: 'Thành viên',
  GUEST: 'Khách',
};

export interface MemberCardHeaderProps {
  card: MemberCard;
  /**
   * p3-04: đóng thẻ TRƯỚC khi mở màn quản lý khách (`<Modal>` còn mở thì màn kế tiếp bị che một
   * nhịp). Cùng `wsId` — cả hai chỉ cần khi thẻ là KHÁCH và người xem quản lý được.
   */
  onClose?: () => void;
  wsId?: string;
}

/**
 * Khối đầu `MemberCardSheet`: ảnh, tên, vai trò, ngày tham gia (app.md p1-02 §3), rồi dòng huy hiệu kỹ năng xác thực (p6-06). Thẻ KHÁCH thêm
 * hạn ("Khách · còn N ngày") và, nếu `actions.canRemove` (cờ BE — đúng với OWNER/ADMIN), lối vào
 * "Quản lý quyền khách" (p3-04). Đặt ở ĐÂY chứ không trong danh sách hành động của sheet vì
 * `MemberCardSheet.tsx` đã sát trần 200 dòng.
 */
export function MemberCardHeader({ card, onClose, wsId }: MemberCardHeaderProps) {
  const live = usePresence(card.userId);
  const presenceState = live.updatedAt > 0 ? live.state : card.presence;
  const name = card.displayName ?? card.name;
  const isGuest = card.role === 'GUEST';
  // p6-03: cố vấn (khách có nhãn `MENTOR`) hiện "Cố vấn · còn N ngày" thay cho "Khách · còn N ngày"; vai vẫn ghi "Khách" (đúng quyền thật).
  const isMentor = isMentorTag(card.displayTag, card.role);

  return (
    // Ảnh `xl` (64) + tên cỡ tiêu đề: đầu thẻ là "người này là ai" (hồ sơ Slack/Discord), không phải một hàng danh sách phóng to.
    <View className="items-center gap-sm pb-md pt-xs">
      <Avatar
        badge={presenceState === 'ONLINE' ? 'success' : undefined}
        name={name}
        size="xl"
        source={card.avatarUrl ? { uri: card.avatarUrl } : undefined}
      />
      <View className="items-center gap-2xs">
        <Text className="text-center text-header-sm font-semibold text-fg-1">{name}</Text>
        <PresenceDot showLabel state={presenceState} />
        <Text className="text-center text-caption-lg text-fg-2">
          {ROLE_LABEL[card.role]} · Tham gia {formatDate(card.joinedAt)}
        </Text>
        {isMentor ? (
          <MemberMentorTag expiresAt={card.expiresAt} />
        ) : isGuest && card.expiresAt ? (
          <GuestBadge expiresAt={card.expiresAt} />
        ) : null}
      </View>
      {/* p6-06: tối đa 3 huy hiệu kỹ năng xác thực (tự ẩn: cờ `career` tắt / người này không chia sẻ / chưa có huy hiệu). */}
      <MemberSkillBadges userId={card.userId} onClose={onClose} />
      {isGuest && card.actions.canRemove && wsId && onClose ? (
        <GuestManageRow userId={card.userId} wsId={wsId} onClose={onClose} />
      ) : null}
    </View>
  );
}

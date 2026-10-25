import { View } from 'react-native';

import type { IconName } from '@/shared/ui/icon';

import type { MemberCard } from '../api';
import { MemberActionRow } from './MemberActionRow';
import type { ModerationAction } from './MemberModerationSheet';
import { MemberSafetyRows } from './MemberSafetyRows';

/** Một hàng hành động của thẻ. `hidden` = BE không cho/không áp dụng — khai ĐỦ rồi lọc, để kẻ ngăn tính theo hàng THẬT sự hiện. */
interface CardAction {
  hidden: boolean;
  icon: IconName;
  key: string;
  label: string;
  onPress: () => void;
  tone?: 'danger' | 'default';
}

export interface MemberCardActionsProps {
  card: MemberCard;
  onChangeRole: () => void;
  /** Đóng thẻ — hai hàng an toàn đóng thẻ TRƯỚC khi mở tấm khác (`<Modal>` còn mở thì tấm kế bị che một nhịp). */
  onClose: () => void;
  onEditDisplayName: () => void;
  onModerate: (action: ModerationAction) => void;
  wsId: string;
}

/**
 * Danh sách hành động QUẢN LÝ của `MemberCardSheet` theo `actions` của BE (app.md p1-02 §3) — tách khỏi thẻ để file đó dưới trần 200
 * dòng. Ba việc hay làm (Nhắn tin · Gọi · Nhắc tên) đã lên hàng nút nhanh `MemberQuickActions` ngay dưới ảnh; ở đây còn Đổi tên hiển
 * thị · Đổi vai trò · Loại · Chặn · Gỡ chặn, rồi hai hàng an toàn cá nhân (`MemberSafetyRows`).
 *
 * Hàng `ListItem` kẻ ngăn, KHÔNG khe giữa hai hàng (bản cũ `gap-3xs` + hàng không kẻ: các hàng trôi rời nhau, mắt không bám được cột).
 */
export function MemberCardActions({
  card,
  onChangeRole,
  onClose,
  onEditDisplayName,
  onModerate,
  wsId,
}: MemberCardActionsProps) {
  const actions: CardAction[] = [
    { hidden: !card.isMe, icon: 'edit', key: 'display-name', label: 'Đổi tên hiển thị', onPress: onEditDisplayName },
    { hidden: !card.actions.canChangeRole, icon: 'user-edit', key: 'role', label: 'Đổi vai trò', onPress: onChangeRole },
    {
      hidden: !card.actions.canRemove,
      icon: 'delete',
      key: 'remove',
      label: 'Loại khỏi nhóm',
      tone: 'danger',
      onPress: () => onModerate('REMOVE'),
    },
    {
      hidden: !card.actions.canBan,
      icon: 'close-acc',
      key: 'ban',
      label: 'Chặn khỏi nhóm',
      tone: 'danger',
      onPress: () => onModerate('BAN'),
    },
    // `MemberActions` (be.md p1-02 §4) KHÔNG có `canUnban` — gỡ chặn không rank-gate như loại/chặn (README §6): hiện theo TRẠNG THÁI
    // người được xem, để BE tự 403 nếu viewer thiếu quyền.
    { hidden: card.status !== 'BANNED', icon: 'user-add', key: 'unban', label: 'Gỡ chặn', onPress: () => onModerate('UNBAN') },
  ];
  const shown = actions.filter((action) => !action.hidden);
  // Hai hàng an toàn (Báo cáo · Chặn người này) luôn đứng CUỐI và chỉ vắng ở thẻ của CHÍNH MÌNH (`MemberSafetyRows` trả `null`) ⇒ còn
  // chúng phía sau thì hàng cuối của nhóm trên vẫn cần kẻ ngăn.
  const safetyFollows = !card.isMe;

  return (
    <View accessibilityRole="menu">
      {shown.map((action, index) => (
        <MemberActionRow
          key={action.key}
          divider={safetyFollows || index < shown.length - 1}
          icon={action.icon}
          label={action.label}
          tone={action.tone}
          onPress={action.onPress}
        />
      ))}
      <MemberSafetyRows card={card} wsId={wsId} onClose={onClose} />
    </View>
  );
}

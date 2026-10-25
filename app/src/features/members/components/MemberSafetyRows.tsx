import { useIsUserBlocked } from '@/shared/hooks/useBlockedIds';
import { useModerationActions } from '@/shared/hooks/useModerationActions';

import type { MemberCard } from '../api';
import { MemberActionRow } from './MemberActionRow';

export interface MemberSafetyRowsProps {
  card: Pick<MemberCard, 'displayName' | 'isMe' | 'name' | 'userId'>;
  /** Đóng thẻ TRƯỚC khi mở tấm kế (`<Modal>` còn mở thì tấm sau bị che một nhịp). */
  onClose: () => void;
  wsId: string;
}

/**
 * Hai hành động RIÊNG TƯ của người xem với một thành viên (p1-08 #7/#8): Báo cáo và Chặn/Bỏ chặn CÁ NHÂN.
 *
 * ⚠️ Khác "Chặn khỏi nhóm" (`canBan`, p1-02): đó là quản trị viên chặn người ta VÀO NHÓM; đây là mình tự chặn để
 * không nhận tin và không bị nhắn — nên nhãn có "người này" và hiện với MỌI thành viên (không cần `actions.*`,
 * vì chặn/báo cáo không phụ thuộc vai trò). Không hiện với chính mình. Cả hai chỉ "yêu cầu" mở tấm qua store chung
 * (`useModerationActions`) — `members` không import `moderation`.
 */
export function MemberSafetyRows({ card, onClose, wsId }: MemberSafetyRowsProps) {
  const { blockUser, reportUser, unblockUser } = useModerationActions();
  const blocked = useIsUserBlocked(card.userId);
  if (card.isMe) return null;

  const name = card.displayName ?? card.name;
  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };

  // Hai hàng này luôn là CUỐI danh sách của thẻ (`MemberCardActions`) ⇒ kẻ ngăn chỉ giữa chúng, không dưới hàng cuối.
  return (
    <>
      <MemberActionRow
        divider
        icon="alert-warning"
        label="Báo cáo người này"
        onPress={act(() => reportUser(card.userId, name, wsId))}
      />
      <MemberActionRow
        icon="cancel-2"
        label={blocked ? 'Bỏ chặn người này' : 'Chặn người này'}
        tone={blocked ? 'default' : 'danger'}
        onPress={act(() =>
          blocked ? unblockUser(card.userId, name) : blockUser(card.userId, name),
        )}
      />
    </>
  );
}

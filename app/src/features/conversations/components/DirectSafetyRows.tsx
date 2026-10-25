import { useIsUserBlocked } from '@/shared/hooks/useBlockedIds';
import { useModerationActions } from '@/shared/hooks/useModerationActions';
import { Section } from '@/shared/ui/section';

import type { ConversationDetail } from '../api/conversations.types';
import { conversationTitle } from '../utils/conversation-title';
import { InfoActionRow } from './InfoActionRow';
import { InfoGroup } from './InfoGroup';

/**
 * "Chặn / Bỏ chặn" và "Báo cáo" trong thông tin hội thoại 1-1 (p1-08 #8; app.md p1-05 §3 `ConversationInfoScreen`
 * DIRECT). 1-1 chỉ báo cáo NGƯỜI DÙNG — báo cáo hội thoại 1-1 là `MOD_003` phía BE ("báo cáo người dùng thay thế").
 * Cả hai chỉ "yêu cầu" mở tấm qua store chung: `conversations` không import `moderation`.
 *
 * Tự mang `Section` + thẻ (`InfoGroup`) — không có người kia (`peer` rỗng) thì không vẽ gì, kể cả tiêu đề nhóm.
 * "Chặn" là thao tác nặng ⇒ tông `danger`; "Bỏ chặn" (gỡ hạn chế) và "Báo cáo" là hàng thường ⇒ `neutral`.
 */
export function DirectSafetyRows({ conversation }: { conversation: ConversationDetail }) {
  const { blockUser, reportUser, unblockUser } = useModerationActions();
  const peer = conversation.peer;
  const blocked = useIsUserBlocked(peer?.userId);
  if (!peer) return null;

  const name = conversationTitle(conversation);

  return (
    <Section icon="shield-user" title="Quyền riêng tư">
      <InfoGroup>
        <InfoActionRow
          icon="cancel-2"
          iconTone="neutral"
          label={blocked ? 'Bỏ chặn' : 'Chặn'}
          tone={blocked ? 'default' : 'danger'}
          onPress={() => (blocked ? unblockUser(peer.userId, name) : blockUser(peer.userId, name))}
        />
        <InfoActionRow
          icon="alert-warning"
          iconTone="neutral"
          label="Báo cáo"
          onPress={() => reportUser(peer.userId, name)}
        />
      </InfoGroup>
    </Section>
  );
}

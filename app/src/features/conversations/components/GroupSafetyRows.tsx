import { router } from 'expo-router';

import { useModerationActions } from '@/shared/hooks/useModerationActions';
import { Section } from '@/shared/ui/section';

import type { ConversationDetail } from '../api/conversations.types';
import { conversationTitle } from '../utils/conversation-title';
import { InfoActionRow } from './InfoActionRow';
import { InfoGroup } from './InfoGroup';

/**
 * "Báo cáo nhóm chat" cho mọi thành viên, và "Báo cáo cần xử lý" cho OWNER/ADMIN nhóm (p1-08 #7/#9): hàng đợi
 * riêng của nhóm chat này — `messages/[conversationId]/reports` (BE `GET /conversations/:id/reports`, 403 nếu
 * không phải OWNER/ADMIN). Báo cáo NHÓM CHAT (đích `CONVERSATION`) chỉ nền tảng xử lý (README §2), còn báo cáo
 * TIN trong nhóm thì OWNER/ADMIN nhóm xử lý — nên hàng đợi này chứa báo cáo tin/người, không chứa báo cáo nhóm.
 *
 * Tự mang `Section` + thẻ (`InfoGroup`) để nơi gọi chỉ cần một dòng. Hàng đợi (việc cần làm) tông `warning`; báo cáo nhóm là hàng phụ ⇒ `neutral`.
 */
export function GroupSafetyRows({ conversation }: { conversation: ConversationDetail }) {
  const { reportConversation } = useModerationActions();
  const canModerate = conversation.myRole === 'OWNER' || conversation.myRole === 'ADMIN';

  return (
    <Section icon="shield-user" title="An toàn và báo cáo">
      <InfoGroup>
        {canModerate ? (
          <InfoActionRow
            icon="shield-user"
            iconTone="warning"
            label="Báo cáo cần xử lý"
            onPress={() =>
              router.push({
                pathname: '/messages/[conversationId]/reports',
                params: { conversationId: conversation.id },
              })
            }
          />
        ) : null}
        <InfoActionRow
          icon="alert-warning"
          iconTone="neutral"
          label="Báo cáo nhóm chat"
          onPress={() => reportConversation(conversation.id, conversationTitle(conversation))}
        />
      </InfoGroup>
    </Section>
  );
}

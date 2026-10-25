import { Card } from '@/shared/ui/card';
import { Section } from '@/shared/ui/section';
import { Toggle } from '@/shared/ui/toggle';

import type { ConversationDetail, ConversationSettings } from '../../api/conversations.types';

export interface GroupSettingsSectionProps {
  conversation: Pick<ConversationDetail, 'settings'>;
  /** Một khoá cài đặt vừa đổi — nơi gọi (`GroupInfo`) gửi PATCH kèm `expectedVersion`. */
  onChange: (settings: Partial<ConversationSettings>) => void;
}

/**
 * Nhóm "Cài đặt nhóm" (chỉ OWNER/ADMIN thấy — nơi gọi quyết): hai công tắc trong một thẻ, tiêu đề `Section` có icon bánh răng.
 * Tách khỏi `GroupInfo` để file đó giữ dưới trần 200 dòng.
 */
export function GroupSettingsSection({ conversation, onChange }: GroupSettingsSectionProps) {
  return (
    <Section icon="setting" title="Cài đặt nhóm">
      <Card className="gap-sm">
        {/* `Toggle label` (không tự ghép `<Text>` đứng cạnh): nhãn nằm TRONG công tắc nên trình đọc màn hình
            xướng "Thành viên được thêm người khác, công tắc, bật" thay vì một chữ mồ côi và một công tắc không tên. */}
        <Toggle
          label="Thành viên được thêm người khác"
          value={conversation.settings.membersCanAdd}
          onChange={(v) => onChange({ membersCanAdd: v })}
        />
        <Toggle
          label="Thành viên được ghim tin"
          value={conversation.settings.memberCanPin}
          onChange={(v) => onChange({ memberCanPin: v })}
        />
      </Card>
    </Section>
  );
}

import { memo } from 'react';

import { Avatar } from '@/shared/ui/avatar';
import { ListItem } from '@/shared/ui/list';
import { PresenceDot } from '@/shared/ui/presence-dot';

import type { PersonHit } from '../api';
import { PERSON_ROLE_LABEL, toPresenceState } from '../utils/result-format';

export interface PersonResultItemProps {
  hit: PersonHit;
  /** Chính mình: BE vẫn trả mình trong kết quả — chỉ hiển thị, không mở tin nhắn riêng với bản thân. */
  isMe: boolean;
  onPress: (hit: PersonHit) => void;
}

/**
 * Một kết quả NGƯỜI (app.md p5-04 §3): avatar · tên · vai trò · trạng thái hiện diện bằng CHỮ (không chỉ chấm màu).
 * Chạm → tin nhắn riêng (`/messages/new?userId=`): thẻ cá nhân của p1-02 là tấm trượt cục bộ của `members`, không có route
 * để đi tới, nên nhắn riêng là đích duy nhất dựng được bằng route. `avatarUrl` của BE luôn `null` cho loại này → chữ cái đầu.
 */
export const PersonResultItem = memo(function PersonResultItem({
  hit,
  isMe,
  onPress,
}: PersonResultItemProps) {
  const role = PERSON_ROLE_LABEL[hit.role] ?? PERSON_ROLE_LABEL.MEMBER;

  return (
    <ListItem
      className="px-md"
      description={isMe ? `${role} · Bạn` : role}
      label={hit.displayName}
      leading={
        <Avatar
          name={hit.displayName}
          size="md"
          source={hit.avatarUrl ? { uri: hit.avatarUrl } : undefined}
        />
      }
      value={<PresenceDot showLabel state={toPresenceState(hit.presence)} />}
      onPress={isMe ? undefined : () => onPress(hit)}
    />
  );
});

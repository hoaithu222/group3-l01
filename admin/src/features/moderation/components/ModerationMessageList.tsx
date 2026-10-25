import { memo } from 'react';

import { EmptyState } from '@/shared/ui';

import type { ModerationMessage } from '../types/moderation.types';
import ModerationMessageItem from './ModerationMessageItem';

export interface ModerationMessageListProps {
  messages: readonly ModerationMessage[];
  canRemove: boolean;
  onRemove: (message: ModerationMessage) => void;
}

/** Tin bị báo cáo ±3 tin ngữ cảnh, theo thứ tự thời gian (`seq` tăng dần do BE trả sẵn). */
const ModerationMessageList = memo(function ModerationMessageList({
  messages,
  canRemove,
  onRemove,
}: ModerationMessageListProps) {
  if (messages.length === 0) {
    return <EmptyState size="sm" title="Không có tin nào để hiển thị" />;
  }
  return (
    <ul aria-label="Tin nhắn bị báo cáo và ngữ cảnh" className="flex flex-col gap-2">
      {messages.map((message) => (
        <ModerationMessageItem
          key={message.id}
          canRemove={canRemove}
          message={message}
          onRemove={onRemove}
        />
      ))}
    </ul>
  );
});

export default ModerationMessageList;

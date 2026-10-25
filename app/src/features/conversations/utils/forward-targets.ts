import type { ForwardTargetOption } from '@/features/chat';

import type { ConversationListItem } from '../api/conversations.types';
import { conversationTitle } from './conversation-title';

/**
 * Hội thoại NHÓM có thể nhận tin chuyển tiếp: còn ACTIVE và không ở chế độ chỉ đọc
 * (giải tán, chặn, hết workspace chung). Đưa vào danh sách rồi để BE từ chối
 * (`DENIED`) thì người dùng chọn xong mới biết — ẩn từ đầu tốt hơn. BE vẫn là
 * hàng rào thật (`message-forward.service.ts`), lọc ở đây chỉ để đỡ nhầm.
 */
export function toForwardTargets(items: readonly ConversationListItem[]): ForwardTargetOption[] {
  return items
    .filter((item) => item.status === 'ACTIVE' && !item.readOnly)
    .map((item) => ({ scopeType: 'CONVERSATION' as const, scopeId: item.id, label: conversationTitle(item) }));
}

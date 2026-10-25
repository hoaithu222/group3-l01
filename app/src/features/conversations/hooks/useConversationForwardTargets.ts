import { useCallback } from 'react';

import type { ForwardTargetOption } from '@/features/chat';

import { conversationsService } from '../api/conversations.service';
import { toForwardTargets } from '../utils/forward-targets';

/** Đủ để cuộn chọn; người dùng thật sự chọn tối đa `forwardTargetsMax` (10) đích mỗi lần. */
const FORWARD_TARGETS_PAGE_SIZE = 20;

/**
 * `ChatRoom.searchForwardTargets` cho màn hội thoại (app.md p1-05 §3): tìm phía
 * SERVER trong NHÓM chat của tôi (`GET /conversations?filter=group&q=`, không dấu).
 * `q` rỗng thì lấy các nhóm gần nhất — BE từ chối `q` rỗng (`min(1)`) nên phải bỏ hẳn tham số.
 *
 * ⚠️ CHỈ nhóm (`filter: 'group'`), không lấy hội thoại 1-1: đích NGƯỜI do chính
 * `ForwardSheet` của `chat` tự tìm (`kind: 'user'` → `directUserId`, BE tự tạo/tìm
 * DIRECT) — trả cả DIRECT ở đây là một người xuất hiện HAI lần trong cùng danh sách.
 * Callback ổn định (không phụ thuộc gì) — `ForwardSheet` chạy lại effect theo
 * tham chiếu của nó, đổi tham chiếu là bắn request lại mỗi lần vẽ.
 */
export function useConversationForwardTargets(): (query: string) => Promise<ForwardTargetOption[]> {
  return useCallback(async (query: string) => {
    const page = await conversationsService.list({
      filter: 'group',
      q: query.trim() || undefined,
      limit: FORWARD_TARGETS_PAGE_SIZE,
    });
    return toForwardTargets(page.data);
  }, []);
}

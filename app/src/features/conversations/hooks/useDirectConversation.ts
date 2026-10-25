import { useQuery } from '@tanstack/react-query';

import { useIsUserBlocked } from '@/shared/hooks/useBlockedIds';

import { conversationsService } from '../api/conversations.service';
import { conversationKeys } from '../api/conversations.keys';
import type { ConversationDetail, DirectEligibility } from '../api/conversations.types';
import { getErrorCode, getErrorDetails } from '../utils/error-details';

export type DirectConversationState =
  | { status: 'loading' }
  | { status: 'existing'; conversation: ConversationDetail }
  | { status: 'draft'; eligibility: DirectEligibility }
  | { status: 'error'; error: unknown; retry: () => void };

/**
 * "Get-or-draft" (app.md §2/§3) — `GET /conversations/direct/:userId`: có sẵn
 * → `existing` (màn cha tự `router.replace` sang màn thật); `CONV_013` (chưa
 * có) → `draft` kèm `details.eligibility` (be.md §4) để `DraftDirectScreen`
 * quyết định hiện `ReadOnlyBar` NGAY cả trước khi gõ tin đầu tiên.
 */
export function useDirectConversation(peerUserId: string): DirectConversationState {
  // p1-08: chặn/bỏ chặn đổi `eligibility` (`BLOCKED`) mà KHÔNG có hội thoại nào để BE phát `conversation:updated`
  // (đây là ca "chưa có hội thoại") — đưa trạng thái chặn vào khoá để đổi là tải lại, không kẹt ở "Bạn đã chặn".
  const blocked = useIsUserBlocked(peerUserId);
  const query = useQuery({
    queryKey: [...conversationKeys.direct(peerUserId), { blocked }],
    queryFn: () => conversationsService.getDirect(peerUserId),
    enabled: Boolean(peerUserId),
    retry: false,
    staleTime: 10_000,
  });

  if (query.isPending) return { status: 'loading' };
  if (query.isSuccess) return { status: 'existing', conversation: query.data };

  if (getErrorCode(query.error) === 'CONV_013') {
    const details = getErrorDetails(query.error);
    const eligibility = details?.eligibility as DirectEligibility | undefined;
    return { status: 'draft', eligibility: eligibility ?? { canMessage: true, reason: null } };
  }
  return { status: 'error', error: query.error, retry: () => void query.refetch() };
}

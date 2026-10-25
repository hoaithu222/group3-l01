import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { joinRequestDecisionPath, joinRequestsPath } from './invitations.api';
import type { JoinRequestListPage, JoinRequestRow } from './invitations.types';
import type { MemberRow } from './members.types';

/** Duyệt tham gia (OWNER/ADMIN) — be.md p3-04 §4. */
export const joinRequestsService = {
  /** Đọc thẳng `response.data` để giữ `meta` cursor. */
  async list(workspaceId: string, cursor: string | undefined, limit = 20): Promise<JoinRequestListPage> {
    const response = await apiClient.get<{ data: JoinRequestRow[]; meta: JoinRequestListPage['meta'] }>(
      joinRequestsPath(workspaceId),
      { params: { cursor, limit } },
    );
    return { items: response.data.data, meta: response.data.meta };
  },

  /**
   * `reason` tuỳ chọn (`joinRequestDecisionSchema`, tối đa 500 ký tự). 409 khi
   * không còn PENDING (người khác đã xử lý) — màn gỡ dòng + toast, không coi là lỗi.
   */
  async decide(
    workspaceId: string,
    userId: string,
    decision: 'approve' | 'reject',
    reason?: string,
  ): Promise<MemberRow> {
    const response = await apiClient.post<MemberRow>(
      joinRequestDecisionPath(workspaceId, userId, decision),
      reason ? { reason } : {},
      { skipErrorToast: true },
    );
    return unwrapData<MemberRow>(response);
  },
};

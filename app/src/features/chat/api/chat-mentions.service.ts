import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import type { ChatScopeRef, MentionablesResult } from './chat.types';

/** `LIMITS.mention.mentionablesLimit` phía BE — BE tự cắt ở mức này, xin thêm chỉ bị `VAL_001`. */
const MENTIONABLES_LIMIT = 20;

/**
 * `GET /scopes/:scopeType/:scopeId/mentionables?q=&limit=&includeRoles=` (be.md p1-06 §4, p3-04 §5.7).
 * `includeRoles=true` CHỈ gửi cho KÊNH: BE bỏ qua ở hội thoại (không có `@role`), và khi người gọi không có `workspace.mention.role`
 * (chỉ OWNER/ADMIN) thì trả `canMentionRole: false` không kèm `roles` — nên gửi luôn không tốn thêm request, picker tự ẩn nhóm "Vai trò".
 * `skipErrorToast`: picker lỗi thì ẨN và cho gõ thường (app.md §3) — một toast
 * giữa lúc đang gõ dở là ồn hơn cả cái lỗi. Cần `write` trên phạm vi nên người
 * chỉ-đọc nhận 403; `enabled` ở hook gọi đã chặn từ trước khi composer khoá.
 */
export const chatMentionsService = {
  async list(
    scope: Pick<ChatScopeRef, 'scopeType' | 'scopeId'>,
    q: string,
  ): Promise<MentionablesResult> {
    const response = await apiClient.get<MentionablesResult>(
      `/scopes/${scope.scopeType}/${scope.scopeId}/mentionables`,
      {
        params: {
          q,
          limit: MENTIONABLES_LIMIT,
          ...(scope.scopeType === 'CHANNEL' && { includeRoles: true }),
        },
        skipErrorToast: true,
      },
    );
    return unwrapData<MentionablesResult>(response);
  },
};

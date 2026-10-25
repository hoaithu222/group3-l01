import { useState } from 'react';

import { grantsService } from '../api';
import type { RoleAccessNotice } from '../components/RoleAccessNoticeDialog';
import { useRevokeGrant } from '../queries/grants.queries';
import { hasRoleSource } from '../utils/access-source';

export interface RevokeCallbacks {
  onError?: (error: unknown) => void;
  onSuccess?: () => void;
}

export interface UseRevokeGrantExplainedResult {
  dismissNotice: () => void;
  isPending: boolean;
  /** Khác `null` khi người vừa bị gỡ quyền TRỰC TIẾP vẫn còn được cấp qua vai trò (PR-05). */
  notice: RoleAccessNotice | null;
  revoke: (userId: string, name: string, callbacks?: RevokeCallbacks) => void;
}

/**
 * Thu hồi grant TRỰC TIẾP + giải thích khi người đó vẫn đọc được vì còn ROLE (PR-05,
 * app.md p3-04 §3).
 *
 * Sau khi gỡ xong mới hỏi `GET …/members/:userId/access` — hỏi TRƯỚC thì phải đoán kết quả
 * (đồng bộ với BE), hỏi SAU thì đó là sự thật. Lỗi ở bước hỏi bị nuốt: gỡ quyền đã thành
 * công rồi, mất phần giải thích chỉ là mất một lời nhắn, không đáng báo lỗi.
 *
 * Tự gỡ CHÍNH MÌNH không hỏi (người dùng sắp bị đưa ra khỏi kênh, và người đó không phải MANAGER
 * để đọc `access` của người khác).
 */
export function useRevokeGrantExplained(chId: string, currentUserId: string | undefined): UseRevokeGrantExplainedResult {
  const revokeGrant = useRevokeGrant(chId);
  const [notice, setNotice] = useState<RoleAccessNotice | null>(null);

  function revoke(userId: string, name: string, callbacks: RevokeCallbacks = {}): void {
    revokeGrant.mutate(userId, {
      onError: callbacks.onError,
      onSuccess: () => {
        callbacks.onSuccess?.();
        if (userId === currentUserId) return;
        grantsService
          .access(chId, userId)
          .then((access) => {
            if (hasRoleSource(access.effectiveSources)) setNotice({ name, sources: access.effectiveSources });
          })
          .catch(() => undefined);
      },
    });
  }

  return { dismissNotice: () => setNotice(null), isPending: revokeGrant.isPending, notice, revoke };
}

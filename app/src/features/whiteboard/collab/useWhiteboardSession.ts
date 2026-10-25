import { useEffect, useMemo, useState } from 'react';

import { SocketEvent, useSocketEvent } from '@/core/socket';
import type { CollabMode } from '@/shared/collab';
import { useAuthStore } from '@/shell/store/slices/auth';

import { whiteboardCollabService } from '../api/whiteboard-collab.service';
import type { WhiteboardDetail } from '../api/whiteboard.types';
import { useWhiteboardSessionStore } from '../store/whiteboard-session.store';
import { httpStatusOf, isNotAvailable } from '../utils/whiteboard-errors';
import { WhiteboardRuntime } from './whiteboard-runtime';

/** 404 (bảng ẩn/không còn) hoặc 403 khi xin token = MẤT QUYỀN (dừng hẳn, thoát); lỗi khác (mạng/BE) = thử lại có backoff. */
export const classifyTokenError = (error: unknown): 'forbidden' | 'retry' =>
  isNotAvailable(error) || httpStatusOf(error) === 403 ? 'forbidden' : 'retry';

/**
 * Phiên vẽ của MỘT bảng: dựng `WhiteboardRuntime` (Y.Doc + collab + awareness) theo `(bảng, người dùng)`, nối trong effect và đẩy trạng thái vào
 * `useWhiteboardSessionStore`. Quyền GHI hiệu lực phía app = server cho sửa (`myPermissions.edit`) + bảng còn hoạt động + token cho `edit` + server không
 * hạ xuống chỉ-đọc + chưa bị ngắt; server vẫn là người quyết định cuối (viewer gửi update bị từ chối ở collab — CW-07).
 * `permission:revoked` cho chính bảng này (WB-05) → lỗi nghiêm trọng `FORBIDDEN` và NGẮT kết nối ngay (không lưu tiếp); màn thoát ở `useLeaveOnRevoke`.
 * Token làm mới trước hạn 60 s do `WhiteboardRuntime` (`CollabRefreshScheduler`); hàm `token` của provider luôn đọc bản mới nhất từ `CollabTokenProvider`.
 */
export function useWhiteboardSession(board: WhiteboardDetail) {
  const userId = useAuthStore((state) => state.user?.id) ?? '';
  const wbId = board.id;
  const [mode, setMode] = useState<CollabMode | null>(null);

  const runtime = useMemo(() => {
    const store = useWhiteboardSessionStore.getState();
    return new WhiteboardRuntime({
      classifyTokenError,
      fetchGrant: () => whiteboardCollabService.issueToken(wbId),
      host: {
        onFailure: (failure) => store.setFailure(failure),
        onGranted: (grant) => setMode(grant.mode),
        onNotice: () => undefined,
        onPeers: (peers) => store.setPeers(peers, userId),
        onSnapshot: (snapshot) => store.setSnapshot(snapshot),
      },
      userId,
    });
  }, [wbId, userId]);

  useEffect(() => {
    useWhiteboardSessionStore.getState().reset();
    void runtime.start();
    return () => {
      runtime.stop();
      useWhiteboardSessionStore.getState().reset();
    };
  }, [runtime]);

  useSocketEvent<{ scopeId?: string; scopeType?: string }>(
    SocketEvent.PERMISSION_REVOKED,
    (event) => {
      if (event.scopeType !== 'WHITEBOARD' || event.scopeId !== wbId) return;
      runtime.stop();
      useWhiteboardSessionStore.getState().setFailure({ code: 'FORBIDDEN', fatal: true });
    },
  );

  const snapshot = useWhiteboardSessionStore((state) => state.snapshot);
  const active = board.status === 'ACTIVE' && !snapshot.archived;
  const canEdit =
    board.myPermissions.edit &&
    active &&
    mode === 'edit' &&
    !snapshot.serverReadOnly &&
    snapshot.connection !== 'closed';

  return { canEdit, mode, runtime };
}

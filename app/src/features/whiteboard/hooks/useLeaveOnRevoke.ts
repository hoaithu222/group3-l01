import { useEffect, useRef } from 'react';

import { showToast } from '@/shared/utils/toast.utils';

import { useWhiteboardSessionStore } from '../store/whiteboard-session.store';

/**
 * Mất quyền (`FORBIDDEN`/`NOT_FOUND`: bị gỡ khỏi bảng, bảng bị xoá, token bị từ chối vì không còn quyền, `permission:revoked` cho chính bảng này —
 * WB-05): thông báo TRUNG TÍNH một lần rồi thoát màn hình — không tiết lộ vì sao (bị gỡ, hay bảng không còn). Kết nối collab đã bị dừng ngay lúc lỗi
 * (`ConnectionController.stopWith` / `useWhiteboardSession`) nên không lưu tiếp; Y.Doc cục bộ biến mất cùng màn hình.
 */
export function useLeaveOnRevoke(onLeave: () => void): void {
  const failure = useWhiteboardSessionStore((state) => state.failure);
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !failure?.fatal) return;
    if (failure.code !== 'FORBIDDEN' && failure.code !== 'NOT_FOUND') return;
    done.current = true;
    showToast('info', 'Bạn không còn quyền truy cập bảng trắng này.');
    onLeave();
  }, [failure, onLeave]);
}

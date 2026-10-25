import { useQueryClient } from '@tanstack/react-query';

import { useSocketEvent } from '@/core/socket';

import type { WhiteboardUpdatedPayload } from '../api/whiteboard.types';
import { WHITEBOARD_UPDATED_EVENT } from '../constants/whiteboard.constants';
import { applyWhiteboardUpdate } from '../utils/whiteboards-cache';

/**
 * Nghe `whiteboard:updated` (BE phát tới TỪNG người trong khán giả của bảng — WORKSPACE: mọi thành viên từ MEMBER + người tạo + cộng tác viên; PRIVATE:
 * chỉ người tạo + cộng tác viên) và đồng bộ danh sách/chi tiết. Chỉ sự kiện của nhóm đang mở cần xử lý nên lọc theo `workspaceId`. Nội dung vẽ KHÔNG đi
 * qua socket (chỉ metadata) — nội dung đến bằng collab. Tên sự kiện khai ở `constants/` (không thêm vào `socket.events.ts` dùng chung).
 */
export function useWhiteboardsSocket(wsId: string): void {
  const queryClient = useQueryClient();
  useSocketEvent<WhiteboardUpdatedPayload>(WHITEBOARD_UPDATED_EVENT, (payload) => {
    if (payload.workspaceId === wsId) applyWhiteboardUpdate(queryClient, payload);
  });
}

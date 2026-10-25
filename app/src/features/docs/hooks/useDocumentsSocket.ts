import { useQueryClient } from '@tanstack/react-query';

import { SocketEvent, useSocketEvent } from '@/core/socket';

import type { DocumentUpdatedPayload } from '../api/docs.types';
import { applyDocumentUpdate } from '../utils/documents-cache';

/**
 * Nghe `document:updated` (BE phát tới TỪNG người trong khán giả của tài liệu — WORKSPACE: mọi thành viên từ MEMBER + người tạo + cộng tác viên;
 * PRIVATE: chỉ người tạo + cộng tác viên) và đồng bộ danh sách/chi tiết. Chỉ sự kiện của nhóm đang mở cần xử lý nên lọc theo `workspaceId`.
 * Nội dung tài liệu KHÔNG đi qua socket (chỉ metadata) — nội dung đến bằng collab.
 */
export function useDocumentsSocket(wsId: string): void {
  const queryClient = useQueryClient();
  useSocketEvent<DocumentUpdatedPayload>(SocketEvent.DOCUMENT_UPDATED, (payload) => {
    if (payload.workspaceId === wsId) applyDocumentUpdate(queryClient, payload);
  });
}

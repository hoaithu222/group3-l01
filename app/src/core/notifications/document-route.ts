import type { Href } from 'expo-router';

import type { NotificationTarget } from './notification-target.types';

/**
 * Real-time Docs (p6-01): thông báo `document.*` của BE (`be/src/modules/documents/services/document-integrations.ts`)
 * → đích. Tách khỏi `notification-route.ts` để file đó giữ trong trần độ dài (cùng vai `mentor-route.ts`/`job-offer-route.ts`).
 *
 * Push/hộp thư chỉ mang id (`workspaceId`, `documentId`) — KHÔNG tiêu đề/nội dung (tài liệu có thể PRIVATE); màn đích tự
 * tải lại và hiện "không còn khả dụng" khi BE trả 403/404. ⛔ Không kiểm quyền ở đây.
 *
 *  · `document.collaborator-added` (được mời cùng soạn, `refs: { workspaceId, documentId, role }`) → mở thẳng tài liệu
 *    (`/workspaces/[wsId]/docs/[docId]`, route thật ở `app/app/(app)/workspaces/[wsId]/docs/[docId].tsx`); thiếu
 *    `documentId` (không nên xảy ra — BE luôn kèm) → danh sách tài liệu của nhóm (`docs/index.tsx`).
 *  · Loại `document.*` lạ, hoặc thiếu `workspaceId` → `null` (rơi về hộp thư Hoạt động).
 *
 * Whiteboard (p6-02) CHƯA đăng ký loại thông báo nào (`registerNotificationType` không xuất hiện trong
 * `be/src/modules/whiteboards`) — chưa có case ở đây; thêm khi BE phát thông báo chia sẻ bảng.
 */
export function isDocumentType(type: string): boolean {
  return type.startsWith('document.');
}

export function documentHref({ documentId, type, workspaceId }: NotificationTarget): Href | null {
  if (!workspaceId) return null;
  if (type === 'document.collaborator-added') {
    if (!documentId) return { params: { wsId: workspaceId }, pathname: '/workspaces/[wsId]/docs' };
    return { params: { docId: documentId, wsId: workspaceId }, pathname: '/workspaces/[wsId]/docs/[docId]' };
  }
  return null;
}

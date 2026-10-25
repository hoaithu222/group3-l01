import type { MessagePermissions } from '../api/chat.types';
import type { MessagesData } from './message-pages';
import type { PermissionBaseline } from './chat-socket-events.types';

/**
 * Payload socket KHÔNG có `myPermissions`/`reactions[].me` (be.md §6). Suy lại:
 *  · `canEdit`/`canRecall` — chỉ đúng tác giả.
 *  · `canReport` — không tự báo cáo tin của chính mình.
 *  · Phần còn lại (`canPin`/`canReact`/`canReply`/`canForward`/`canModerate`) do
 *    `scope.capabilities(viewer)` quyết định — GIỐNG NHAU cho mọi tin trong cùng
 *    scope (be.md §5.2 "tính một lần cho cả trang") — lấy mẫu từ tin BẤT KỲ đã
 *    có sẵn trong cache làm đường cơ sở; chưa có mẫu nào thì khoá an toàn
 *    (`false`) thay vì đoán liều — thiếu một nút hành động còn hơn lộ nút sai quyền.
 */
export function synthesizeMyPermissions(
  baseline: PermissionBaseline | undefined,
  authorId: string | null,
  currentUserId: string | undefined,
): MessagePermissions {
  const isAuthor = authorId !== null && authorId === currentUserId;
  return {
    canEdit: isAuthor,
    canRecall: isAuthor,
    canReport: !isAuthor,
    canPin: baseline?.canPin ?? false,
    canReact: baseline?.canReact ?? false,
    canReply: baseline?.canReply ?? false,
    canForward: baseline?.canForward ?? false,
    canModerate: baseline?.canModerate ?? false,
  };
}

export function findPermissionBaseline(data: MessagesData | undefined): PermissionBaseline | undefined {
  for (const page of data?.pages ?? []) {
    const sample = page.data[0];
    if (sample) return sample.myPermissions;
  }
  return undefined;
}

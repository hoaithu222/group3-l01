import { useMessageExtensionScope } from '@/shared/message-extensions';
import { useThreadUnread } from '@/shared/notifications';

import { ThreadSummaryRow, type ThreadSummaryRowProps } from './ThreadSummaryRow';

type ThreadSummaryProps = Omit<ThreadSummaryRowProps, 'message' | 'unreadCount'> & {
  message: ThreadSummaryRowProps['message'] & { threadRecordId?: string };
};

/**
 * `ThreadSummaryRow` + chấm "N mới" (p1-06 app.md §3) — nơi DUY NHẤT nối hàng tóm tắt với số phản hồi chưa đọc của luồng.
 *
 * Số lấy từ `GET /me/unread?workspaceId=` (`useThreadUnread`, khoá bằng `MessageView.threadRecordId` = `Thread.id`); workspace lấy từ khe
 * mở rộng (`useMessageExtensionScope().workspaceId` — màn kênh nạp qua `ChatRoom.extension`, `chat` không tự biết nhóm chứa kênh).
 *
 * ⛔ Tách MỘT tầng con để hook chỉ chạy cho tin gốc ĐÃ có luồng: `MessageBubble` vẽ hàng này cho MỌI tin của kênh, hook đặt ở tầng ngoài
 * thì mỗi bong bóng thêm một bộ theo dõi query dù chẳng có luồng nào. Thiếu workspace/`threadRecordId` (hội thoại, test riêng lẻ, BE cũ) thì vẽ
 * hàng KHÔNG chấm — và không cần `QueryClientProvider`.
 */
export function ThreadSummary({ message, ...rest }: ThreadSummaryProps) {
  const workspaceId = useMessageExtensionScope()?.workspaceId;
  const { replyCount, threadRecordId } = message;

  if ((replyCount ?? 0) <= 0) return null;
  if (!workspaceId || !threadRecordId) return <ThreadSummaryRow message={message} {...rest} />;
  return (
    <ThreadSummaryWithUnread
      message={message}
      threadRecordId={threadRecordId}
      workspaceId={workspaceId}
      {...rest}
    />
  );
}

function ThreadSummaryWithUnread({
  threadRecordId,
  workspaceId,
  ...rest
}: ThreadSummaryProps & { threadRecordId: string; workspaceId: string }) {
  const unreadCount = useThreadUnread(workspaceId, threadRecordId);
  return <ThreadSummaryRow {...rest} unreadCount={unreadCount} />;
}

import { TaskDetailScreen } from '@/features/boards';

/**
 * Chi tiết thẻ (p3-03) — trình bày `modal` khai ở `[boardId]/_layout.tsx`. Giữ nguyên tên file/đường dẫn: đó là
 * URL mà `TaskCardMini` (`useKanbanBoard.onOpenTask`) và `TaskLinkResolverScreen` đẩy tới.
 */
export default function TaskDetailRoute() {
  return <TaskDetailScreen />;
}

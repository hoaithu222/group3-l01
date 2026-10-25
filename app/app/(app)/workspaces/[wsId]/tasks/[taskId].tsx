import { TaskLinkResolverScreen } from '@/features/boards';

/** Đích của deep link `/w/{wsId}/t/{taskId}` — giải `boardId` rồi chuyển sang route chi tiết thẻ. */
export default function TaskLinkRoute() {
  return <TaskLinkResolverScreen />;
}

import { useQuery } from '@tanstack/react-query';

import { SocketEvent, useSocketEvent } from '@/core/socket';
import { useAuthStore } from '@/shell/store/slices/auth';

import { workspacesService, type WorkspaceListItem } from '../api';
import { workspaceKeys } from '../queries/workspaces.keys';

/** Dự phòng khi socket không tới (người đang chờ chưa vào room `ws:` nào): hỏi lại mỗi 30 giây. */
const POLL_MS = 30_000;

export type JoinPendingState =
  | 'loading'
  /** Vẫn ở danh sách với `status: 'PENDING'`. */
  | 'pending'
  /** Đã có trong danh sách với trạng thái thường → được duyệt. */
  | 'approved'
  /** Không còn trong danh sách: bị từ chối, hoặc yêu cầu đã bị huỷ/hết hiệu lực. */
  | 'gone';

export interface UseJoinPendingStateResult {
  name: string | undefined;
  state: JoinPendingState;
  /** Mục của nhóm trong danh sách (ảnh bìa, avatar, tên…) để màn chờ vẽ ĐÚNG nhóm đang xin vào; `undefined` khi chưa/không còn. */
  workspace: WorkspaceListItem | undefined;
}

/**
 * Trạng thái yêu cầu tham gia của CHÍNH MÌNH, suy từ `GET /workspaces` (be.md §5.5:
 * "trả mục với `status: PENDING`") — nguồn DUY NHẤT: `GET /workspaces/:id` trả 404 cho
 * người đang chờ nên không hỏi được theo id.
 *
 * ⚠️ Người đang chờ CHƯA phải thành viên nên KHÔNG có trong room `ws:{id}` — đừng trông
 * vào `member:updated` (be.md §6, gửi `ws:`) làm tín hiệu chính. Tín hiệu tới thật là
 * `notification:created` (`JOIN_APPROVED`/`JOIN_REJECTED` gửi `user:{id}`); cả hai (và
 * `member:updated`, nếu có tới) chỉ dùng để HỎI LẠI ngay thay vì chờ vòng poll 30 giây.
 */
export function useJoinPendingState(workspaceId: string): UseJoinPendingStateResult {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const { data, isFetching, refetch } = useQuery({
    queryKey: workspaceKeys.list('ACTIVE'),
    queryFn: () => workspacesService.list('ACTIVE'),
    refetchInterval: POLL_MS,
    staleTime: 0,
  });

  useSocketEvent(SocketEvent.NOTIFICATION_CREATED, () => void refetch());
  useSocketEvent<{ workspaceId?: string; userId?: string }>(SocketEvent.MEMBER_UPDATED, (payload) => {
    if (payload.workspaceId === workspaceId && payload.userId === currentUserId) void refetch();
  });

  if (!data) return { name: undefined, state: 'loading', workspace: undefined };
  const item = data.find((workspace) => workspace.id === workspaceId);
  // Đang tải lại mà chưa thấy mục: có thể là bản cache CŨ (trước khi vừa gửi yêu cầu) — chưa kết luận 'gone'.
  if (!item) return { name: undefined, state: isFetching ? 'loading' : 'gone', workspace: undefined };
  return {
    name: item.name,
    state: item.status === 'PENDING' ? 'pending' : 'approved',
    workspace: item,
  };
}

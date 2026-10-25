import { useCallback, useEffect } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { useRoomSubscription } from '@/core/socket';
import { showToast } from '@/shared/utils/toast.utils';

import { boardKeys } from '../queries/boards.keys';
import { useBoard } from '../queries/boards.queries';
import { getHttpStatus } from '../utils/error-details';

const LOST_ACCESS_MESSAGE = 'Bạn không còn quyền xem bảng này';

/**
 * Phạm vi MỘT bảng đang mở (app.md §1 `[boardId]/_layout.tsx`): vào phòng
 * `board:{id}` khi mount, rời khi unmount (refcount ở `core/socket`), và đưa
 * người dùng về hub nhóm khi mất quyền.
 *
 * "Mất quyền" có hai dấu hiệu: ack `room:join` lỗi (`denied`, PM2-14) hoặc
 * `GET /boards/:id` trả 404 (bảng bị xoá / người ngoài — GUEST luôn 404). Mất
 * quyền qua thu hồi NHÓM do `useWorkspaceSocket` (layout `[wsId]`) lo, nên ở
 * đây không nghe `permission:revoked`.
 */
export function useBoardScope(wsId: string, boardId: string) {
  const queryClient = useQueryClient();
  const room = useRoomSubscription('board', boardId);
  const board = useBoard(boardId);

  const leaveToHub = useCallback(() => {
    queryClient.removeQueries({ queryKey: boardKeys.detail(boardId) });
    queryClient.removeQueries({ queryKey: boardKeys.tasksAll(boardId) });
    queryClient.removeQueries({ queryKey: boardKeys.ganttAll(boardId) });
    router.replace({ params: { wsId }, pathname: '/workspaces/[wsId]' });
    showToast('info', LOST_ACCESS_MESSAGE);
  }, [boardId, queryClient, wsId]);

  const notFound = getHttpStatus(board.error) === 404;

  useEffect(() => {
    if (room.status === 'denied' || notFound) leaveToHub();
  }, [leaveToHub, notFound, room.status]);

  return { board, room };
}

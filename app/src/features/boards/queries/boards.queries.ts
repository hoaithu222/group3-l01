import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  boardsService,
  type BoardDetail,
  type BoardDto,
  type CreateBoardPayload,
  type PutColumnsPayload,
  type UpdateBoardPayload,
} from '../api';
import { invalidateBoardDerived } from '../utils/board-derived-cache';
import { boardKeys } from './boards.keys';

/** Danh sách bảng của nhóm — `staleTime` ngắn vì số thẻ/% hoàn thành đổi liên tục. */
export function useBoards(workspaceId: string | undefined, archived: boolean) {
  return useQuery({
    queryKey: boardKeys.list(workspaceId ?? '', archived),
    queryFn: () => boardsService.list(workspaceId as string, archived),
    enabled: Boolean(workspaceId),
    staleTime: 15_000,
  });
}

export function useBoard(boardId: string | undefined) {
  return useQuery({
    queryKey: boardKeys.detail(boardId ?? ''),
    queryFn: () => boardsService.get(boardId as string),
    enabled: Boolean(boardId),
    staleTime: 15_000,
  });
}

/** Ghi `BoardDto` mới nhất vào `detail` (giữ `labels`/`myPermissions` đang có — `BoardDto` không mang chúng). */
export function mergeBoardDto(previous: BoardDetail | undefined, dto: BoardDto): BoardDetail | undefined {
  return previous ? { ...previous, ...dto } : previous;
}

export function useCreateBoard(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      payload,
      idempotencyKey,
    }: {
      payload: CreateBoardPayload;
      idempotencyKey: string;
    }) => boardsService.create(workspaceId, payload, idempotencyKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...boardKeys.all, 'list', workspaceId] });
    },
  });
}

export function useUpdateBoard(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateBoardPayload) => boardsService.update(boardId, payload),
    onSuccess: (dto) => {
      queryClient.setQueryData<BoardDetail>(boardKeys.detail(boardId), (previous) =>
        mergeBoardDto(previous, dto),
      );
      void queryClient.invalidateQueries({ queryKey: [...boardKeys.all, 'list', dto.workspaceId] });
    },
  });
}

/** `TASK_007/008` và `RES_003` được màn Cài đặt đọc từ `error` — service đã tắt toast tự động. */
export function usePutColumns(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PutColumnsPayload) => boardsService.putColumns(boardId, payload),
    onSuccess: (dto) => {
      queryClient.setQueryData<BoardDetail>(boardKeys.detail(boardId), (previous) =>
        mergeBoardDto(previous, dto),
      );
      // Cột đổi (thêm/xoá/đổi kind) ⇒ nhóm thẻ theo cột phải tải lại; "N cột", % xong (cột Done), Gantt, điểm đóng góp theo.
      void queryClient.invalidateQueries({ queryKey: boardKeys.tasksAll(boardId) });
      invalidateBoardDerived(queryClient, boardId);
    },
  });
}

export function useArchiveBoard(boardId: string, workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (archive: boolean) =>
      archive ? boardsService.archive(boardId) : boardsService.restore(boardId),
    onSuccess: (dto) => {
      queryClient.setQueryData<BoardDetail>(boardKeys.detail(boardId), (previous) =>
        mergeBoardDto(previous, dto),
      );
      void queryClient.invalidateQueries({ queryKey: [...boardKeys.all, 'list', workspaceId] });
    },
  });
}

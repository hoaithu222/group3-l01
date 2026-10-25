import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  boardArchivePath,
  boardColumnsPath,
  boardPath,
  boardRestorePath,
  workspaceBoardsPath,
  workspaceMembersPath,
  workspacePath,
} from './boards.api';
import type {
  BoardDetail,
  BoardDto,
  BoardSummary,
  CreateBoardPayload,
  PutColumnsPayload,
  UpdateBoardPayload,
  WorkspaceBoardAccess,
  WorkspaceMemberOption,
} from './boards.types';

export const boardsService = {
  async list(workspaceId: string, archived: boolean): Promise<BoardSummary[]> {
    const response = await apiClient.get<BoardSummary[]>(workspaceBoardsPath(workspaceId), {
      params: { archived },
    });
    return unwrapData<BoardSummary[]>(response);
  },

  /** `idempotencyKey` bắt buộc (`idempotencyKey("board-create")` phía BE) — sinh MỘT LẦN lúc mở màn tạo. */
  async create(
    workspaceId: string,
    payload: CreateBoardPayload,
    idempotencyKey: string,
  ): Promise<BoardDto> {
    const response = await apiClient.post<BoardDto>(workspaceBoardsPath(workspaceId), payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    return unwrapData<BoardDto>(response);
  },

  async get(boardId: string): Promise<BoardDetail> {
    const response = await apiClient.get<BoardDetail>(boardPath(boardId));
    return unwrapData<BoardDetail>(response);
  },

  async update(boardId: string, payload: UpdateBoardPayload): Promise<BoardDto> {
    const response = await apiClient.patch<BoardDto>(boardPath(boardId), payload);
    return unwrapData<BoardDto>(response);
  },

  /** `TASK_007 { columnId, taskCount }` / `TASK_008` / `RES_003` do màn gọi tự đọc — nên tắt toast tự động. */
  async putColumns(boardId: string, payload: PutColumnsPayload): Promise<BoardDto> {
    const response = await apiClient.put<BoardDto>(boardColumnsPath(boardId), payload, {
      skipErrorToast: true,
    });
    return unwrapData<BoardDto>(response);
  },

  async archive(boardId: string): Promise<BoardDto> {
    const response = await apiClient.post<BoardDto>(boardArchivePath(boardId));
    return unwrapData<BoardDto>(response);
  },

  async restore(boardId: string): Promise<BoardDto> {
    const response = await apiClient.post<BoardDto>(boardRestorePath(boardId));
    return unwrapData<BoardDto>(response);
  },

  /** Lát vai trò/trạng thái của nhóm — chung khoá cache `['workspaces','detail',wsId]` (xem `useWorkspaceBoardAccess`). */
  async workspaceAccess(workspaceId: string): Promise<WorkspaceBoardAccess> {
    const response = await apiClient.get<WorkspaceBoardAccess>(workspacePath(workspaceId));
    return unwrapData<WorkspaceBoardAccess>(response);
  },

  /**
   * Thành viên nhóm đang ACTIVE cho bộ chọn "Người làm". Đọc `response.data.data`
   * chứ không `unwrapData` vì endpoint này kèm `meta` phân trang (cùng lý do
   * `channelsService.searchWorkspaceMembers`).
   */
  async searchWorkspaceMembers(workspaceId: string, q?: string): Promise<WorkspaceMemberOption[]> {
    const response = await apiClient.get<{ data: WorkspaceMemberOption[] }>(
      workspaceMembersPath(workspaceId),
      { params: { status: 'ACTIVE', q: q || undefined, page: 1, limit: 100 } },
    );
    return response.data.data;
  },
};

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  boardBlueprintsService,
  type CreateBoardFromTemplatePayload,
  type DuplicateBoardPayload,
} from '../api';
import { boardKeys } from './boards.keys';

/** Mẫu bảng là dữ liệu TĨNH của BE (đổi theo bản phát hành) — cache dài; `retry` mặc định để lỗi mạng thoáng qua tự lành. */
const TEMPLATES_STALE_MS = 10 * 60_000;

/** Danh sách mẫu bảng — chỉ tải khi người dùng chọn "Từ mẫu" (`enabled`), không tải khi mở màn tạo bảng. */
export function useBoardTemplates(enabled = true) {
  return useQuery({
    enabled,
    queryFn: () => boardBlueprintsService.templates(),
    queryKey: boardKeys.templates(),
    staleTime: TEMPLATES_STALE_MS,
  });
}

/**
 * Tạo bảng từ mẫu. Cùng quyền/trần với tạo bảng thường (OWNER/ADMIN, `TASK_009`) nên làm mới ĐÚNG khoá mà `useCreateBoard` làm mới:
 * danh sách bảng của nhóm (cả tab "Đang dùng" và "Đã lưu trữ"). Không ghi `detail` của bảng mới: phản hồi thiếu `myPermissions`, mở
 * bảng thì `GET /boards/:id` cấp. Lỗi để nguyên cho form hiện (`skipErrorToast` ở service).
 */
export function useCreateBoardFromTemplate(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      idempotencyKey,
      payload,
    }: {
      idempotencyKey: string;
      payload: CreateBoardFromTemplatePayload;
    }) => boardBlueprintsService.createFromTemplate(workspaceId, payload, idempotencyKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...boardKeys.all, 'list', workspaceId] });
    },
  });
}

/**
 * Sao chép bảng → bảng mới xuất hiện trong danh sách bảng của nhóm; có sao chép thẻ (`copiedTasks`) thì heatmap cấp nhóm cũng cũ (thẻ mới sinh hoạt
 * động ở bảng mới — khoá `['contribution','workspace-heatmap']` của `contribution.keys.ts`, ghi tay vì không import chéo). Lỗi (`TASK_009`, 403, 404)
 * do tấm sao chép hiện.
 */
export function useDuplicateBoard(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      boardId,
      idempotencyKey,
      payload,
    }: {
      boardId: string;
      idempotencyKey: string;
      payload: DuplicateBoardPayload;
    }) => boardBlueprintsService.duplicate(boardId, payload, idempotencyKey),
    onSuccess: (board) => {
      void queryClient.invalidateQueries({ queryKey: [...boardKeys.all, 'list', workspaceId] });
      if (board.copiedTasks) {
        void queryClient.invalidateQueries({ queryKey: ['contribution', 'workspace-heatmap'] });
      }
    },
  });
}

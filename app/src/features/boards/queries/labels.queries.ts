import { useMutation, useQueryClient } from '@tanstack/react-query';

import { labelsService, type BoardDetail, type LabelPayload } from '../api';
import { boardKeys } from './boards.keys';

/**
 * Nhãn của bảng nằm sẵn trong `BoardDetail.labels` (be.md §4 `GET /boards/:id`) —
 * mọi thay đổi nhãn cập nhật thẳng vào cache `detail`, không cần khoá riêng.
 */
function patchLabels(
  queryClient: ReturnType<typeof useQueryClient>,
  boardId: string,
  update: (labels: BoardDetail['labels']) => BoardDetail['labels'],
): void {
  queryClient.setQueryData<BoardDetail>(boardKeys.detail(boardId), (board) =>
    board ? { ...board, labels: update(board.labels) } : board,
  );
}

export function useCreateLabel(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: LabelPayload) => labelsService.create(boardId, payload),
    onSuccess: (label) => patchLabels(queryClient, boardId, (labels) => [...labels, label]),
  });
}

export function useUpdateLabel(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ labelId, payload }: { labelId: string; payload: Partial<LabelPayload> }) =>
      labelsService.update(labelId, payload),
    onSuccess: (label) =>
      patchLabels(queryClient, boardId, (labels) =>
        labels.map((item) => (item.id === label.id ? label : item)),
      ),
  });
}

/** Xoá nhãn đang dùng: BE gỡ `labelIds` khỏi thẻ (`$pull`) ⇒ thẻ đổi, nên tải lại cache thẻ. */
export function useDeleteLabel(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (labelId: string) => labelsService.remove(labelId),
    onSuccess: (_result, labelId) => {
      patchLabels(queryClient, boardId, (labels) => labels.filter((item) => item.id !== labelId));
      void queryClient.invalidateQueries({ queryKey: boardKeys.tasksAll(boardId) });
    },
  });
}

import { useMutation, useQuery } from '@tanstack/react-query';

import { contributionService } from '../api/contribution.service';
import type { CreateExportInput } from '../api/contribution.types';
import { contributionKeys } from './contribution.keys';

/** Nhịp hỏi lại trạng thái khi tệp còn đang được tạo (app.md §4). */
export const EXPORT_POLL_MS = 5_000;

/** Yêu cầu xuất PDF (`202` hoặc `200` nếu đã có bản cùng dữ liệu). Lỗi (429 `RATE_002`…) để nơi gọi tự hiện. */
export function useCreateExport(boardId: string) {
  return useMutation({
    mutationFn: (input: CreateExportInput) => contributionService.createExport(boardId, input),
  });
}

/**
 * Trạng thái một lượt xuất: hỏi lại mỗi 5 giây khi `QUEUED`/`RUNNING`, DỪNG khi đã kết thúc (READY/FAILED/EXPIRED) hoặc khi lỗi
 * (`410 CONTRIB_005` = hết hạn). `notification:created` của loại `contribution.export-*` cũng làm mới sớm (xem `useExportRealtime`).
 * `retry: false`: 404/410 là kết luận, thử lại vẫn thế.
 */
export function useExportStatus(exportId: string | undefined) {
  return useQuery({
    enabled: Boolean(exportId),
    queryFn: () => contributionService.getExport(exportId as string),
    queryKey: contributionKeys.export(exportId ?? ''),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'QUEUED' || status === 'RUNNING' ? EXPORT_POLL_MS : false;
    },
    retry: false,
    staleTime: 0,
  });
}

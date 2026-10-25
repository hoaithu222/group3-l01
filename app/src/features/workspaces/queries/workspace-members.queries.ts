import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { workspacesService } from '../api';
import { workspaceKeys } from './workspaces.keys';

/**
 * Người có thể nhận quyền chủ nhóm (`TransferOwnerSheet`). `enabled` do nơi gọi
 * truyền (chỉ tải khi sheet MỞ) — danh sách này chỉ cần trong một thao tác hiếm
 * và nguy hiểm, không đáng một request mỗi lần mở màn cài đặt.
 *
 * `staleTime` 30 s: đủ để gõ tìm lại không bắn request thừa, đủ ngắn để người
 * vừa được mời vào nhóm hiện ra ở lần mở sheet sau. `keepPreviousData`: gõ tìm thì
 * danh sách CŨ ở lại tới khi kết quả mới về — không có nó, mỗi ký tự gõ là một lần
 * danh sách chớp thành khung xương rồi hiện lại.
 */
export function useTransferCandidates(workspaceId: string, q: string, enabled: boolean) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: workspaceKeys.transferCandidates(workspaceId, trimmed),
    queryFn: () => workspacesService.listTransferCandidates(workspaceId, trimmed || undefined),
    enabled: enabled && Boolean(workspaceId),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  templateKeys,
  workspaceDetailKey,
  workspaceTemplatesService,
  type ApplyTemplatePayload,
} from '../api';
import { TEMPLATES_STALE_TIME_MS } from '../constants/workspace-templates.constants';

/**
 * Mẫu nhóm đang bật (app.md p5-04 §4): `staleTime` 1 giờ — chỉ admin đổi mẫu, và đổi chỉ áp cho nhóm tạo sau. Số lần thử lại theo
 * mặc định của app (`retry: 1`, `core/config/query-client.ts`): đây là bước PHỤ của form tạo nhóm nên lỗi mạng hiện "Thử lại" sau
 * đúng một lượt. `enabled` = cờ phụ `workspaceTemplates` bật (nơi gọi truyền) — tắt thì không bắn request nào.
 */
export function useTemplates(enabled = true) {
  return useQuery({
    queryKey: templateKeys.list(),
    queryFn: () => workspaceTemplatesService.list(),
    enabled,
    staleTime: TEMPLATES_STALE_TIME_MS,
  });
}

/** Tên kênh hiện có của nhóm — chỉ để báo trước kênh sẽ bị bỏ qua; lỗi thì màn vẫn dùng được (không có gợi ý). */
export function useExistingChannelNames(workspaceId: string, enabled: boolean) {
  return useQuery({
    queryKey: templateKeys.channelNames(workspaceId),
    queryFn: () => workspaceTemplatesService.listChannelNames(workspaceId),
    enabled,
    retry: false,
    // 0: kênh được tạo/đổi tên ở feature `channels` — không ai làm mới khoá riêng này, mở màn là tải lại nền.
    staleTime: 0,
  });
}

/**
 * Vai trò của mình + trạng thái nhóm — dùng CHUNG khoá cache với `useWorkspace()` (xem `workspaceDetailKey`) nên hầu như không
 * tốn request: `[wsId]/_layout` đã tải nó.
 */
export function useTemplateWorkspaceHead(workspaceId: string) {
  return useQuery({
    queryKey: workspaceDetailKey(workspaceId),
    queryFn: () => workspaceTemplatesService.getWorkspaceHead(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });
}

/**
 * Áp mẫu cho nhóm đã có. Thành công thì danh sách kênh của nhóm (`['channels', wsId]` — hợp đồng cache của `channels`, không
 * import feature đó) và danh sách tên kênh ở màn này được làm mới: kênh vừa tạo phải hiện ở nơi khác NGAY.
 */
export function useApplyTemplate(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ApplyTemplatePayload) =>
      workspaceTemplatesService.apply(workspaceId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['channels', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: templateKeys.channelNames(workspaceId) });
    },
  });
}

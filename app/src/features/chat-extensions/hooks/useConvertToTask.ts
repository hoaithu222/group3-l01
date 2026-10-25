import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { chatKeys, patchMessageById, type ChatScopeRef, type MessagesData } from '@/features/chat';

import { conversionKeys } from '../api/chat-extensions.keys';
import type { ToTaskInput } from '../api/chat-extensions.types';
import { conversionService } from '../api/conversion.service';

/** Nhóm của tôi (chọn đích khi phòng chat KHÔNG thuộc một nhóm cụ thể — hội thoại). Chỉ tải khi tấm đang cần. */
export function useWorkspaceOptions(enabled: boolean) {
  return useQuery({
    queryKey: conversionKeys.workspaces,
    enabled,
    queryFn: () => conversionService.listWorkspaces(),
    retry: false,
    // 0: nhóm của tôi đổi ở feature KHÁC (tham gia/rời/đổi tên) mà không ai làm mới khoá riêng này — mở tờ chọn là tải lại nền.
    staleTime: 0,
  });
}

/** Bảng (kèm cột) của một nhóm. `workspaceId` chưa có ⇒ không gọi. */
export function useBoardOptions(workspaceId: string | undefined) {
  return useQuery({
    queryKey: conversionKeys.boards(workspaceId ?? ''),
    enabled: workspaceId !== undefined,
    queryFn: () => conversionService.listBoards(workspaceId ?? ''),
    retry: false,
    staleTime: 60_000,
  });
}

/**
 * Tạo thẻ công việc từ MỘT tin. `idempotencyKey` do tấm sinh mỗi lượt mở (xem `conversionService.toTask`). Thành công ⇒ gắn `sourceRefs` vào tin trong cache ngay để chip
 * "Đã tạo task" hiện không chờ socket (BE ghi `sourceRefs` cùng lúc). Lỗi KHÔNG toast: `VAL_001 WORKSPACE_MISMATCH`/`TASK_*` hiện trong tấm để người dùng chọn lại bảng.
 */
export function useConvertToTask(scope: ChatScopeRef, messageId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = chatKeys.messages(scope);

  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: ToTaskInput; idempotencyKey: string }) =>
      conversionService.toTask(messageId ?? '', input, idempotencyKey),
    onSuccess: (result) => {
      if (!messageId) return;
      queryClient.setQueryData<MessagesData>(queryKey, (data) =>
        data
          ? patchMessageById(data, messageId, (m) =>
              (m.sourceRefs ?? []).some((s) => s.kind === 'TASK' && s.refId === result.sourceRef.refId)
                ? m
                : {
                    ...m,
                    sourceRefs: [
                      ...(m.sourceRefs ?? []),
                      { kind: 'TASK', refId: result.sourceRef.refId, createdAt: new Date().toISOString() },
                    ],
                  },
            )
          : data,
      );
    },
  });
}

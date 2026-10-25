import { useMutation, useQueryClient } from '@tanstack/react-query';

import { chatKeys, patchMessageById, type ChatScopeRef, type MessagesData } from '@/features/chat';

import type { ToResourceInput } from '../api/chat-extensions.types';
import { conversionService } from '../api/conversion.service';

/**
 * Lưu tệp đính kèm của MỘT tin vào kho tài liệu của nhóm. `idempotencyKey` do tấm cấp (`useIdempotencyKey` — đổi sau lỗi 4xx, xem `conversionService.toResource`).
 * Lỗi KHÔNG toast và KHÔNG xử lý ở đây: tấm đọc `error` để hiện câu lỗi trong tấm hoặc chuyển sang bước XÁC NHẬN (`needsVisibilityConfirmation`).
 *
 * Thành công ⇒ (1) gắn `sourceRefs` `RESOURCE` vào tin trong cache ngay để chip "Đã lưu vào tài liệu" hiện không chờ socket (BE ghi `sourceRefs` cùng lúc);
 * (2) làm cũ mọi danh sách/hạn mức của kho tài liệu nhóm đích — màn tài liệu đang mounted dưới ngăn xếp, không ai khác làm mới nó.
 */
export function useConvertToResource(scope: ChatScopeRef, messageId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = chatKeys.messages(scope);

  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: ToResourceInput; idempotencyKey: string }) =>
      conversionService.toResource(messageId ?? '', input, idempotencyKey),
    onSuccess: (result, { input }) => {
      if (messageId) {
        const createdAt = new Date().toISOString();
        queryClient.setQueryData<MessagesData>(queryKey, (data) =>
          data
            ? patchMessageById(data, messageId, (m) => {
                const known = new Set((m.sourceRefs ?? []).filter((s) => s.kind === 'RESOURCE').map((s) => s.refId));
                const added = result.sourceRefs
                  .filter((ref) => !known.has(ref.refId))
                  .map((ref) => ({ kind: 'RESOURCE' as const, refId: ref.refId, createdAt }));
                return added.length === 0 ? m : { ...m, sourceRefs: [...(m.sourceRefs ?? []), ...added] };
              })
            : data,
        );
      }
      // Khoá chéo feature ghi tay — khớp tiền tố `resourceKeys` (`features/resources/queries/resources.keys.ts`): phần tử thứ 3 LUÔN là `wsId`.
      void queryClient.invalidateQueries({
        queryKey: ['resources'],
        predicate: (query) => query.queryKey[2] === input.workspaceId,
      });
    },
  });
}

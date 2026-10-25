import { useMutation, useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import { scheduledKeys } from '../api/chat-extensions.keys';
import type { ScheduledMessageView } from '../api/chat-extensions.types';
import { scheduledMessageService } from '../api/scheduled-message.service';
import { currentTimeZone, formatWhen } from '../utils/local-time';
import { useScheduledFailure } from './useScheduledMessages';

/**
 * Thao tác trên MỘT dòng của "Tin đã hẹn": đổi giờ · sửa nội dung · huỷ · gửi ngay · gửi lại (tin lỗi → hẹn MỚI). Không lạc quan — mỗi thao tác là CAS phía BE
 * (`expectedVersion` → `RES_003`, đã gửi/huỷ → `SCHED_003`), giả lập ở client chỉ để sai. Xong ⇒ làm mới mọi danh sách; lỗi ⇒ `useScheduledFailure` (toast + tải lại khi bản ghi đã đổi).
 * Mọi mutation trả về nguyên vẹn để tấm/hộp thoại đọc `isPending`/`error` (SCHED_001 dưới ô giờ).
 */
export function useScheduledActions() {
  const queryClient = useQueryClient();
  const onError = useScheduledFailure();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: scheduledKeys.all });

  const reschedule = useMutation({
    mutationFn: ({ row, sendAt }: { row: ScheduledMessageView; sendAt: string }) =>
      scheduledMessageService.update(row.id, {
        sendAt,
        timezone: currentTimeZone(),
        expectedVersion: row.version,
      }),
    onSuccess: (view) => {
      refresh();
      showToast('success', `Đã đổi giờ gửi: ${formatWhen(view.sendAt)}`);
    },
    onError,
  });

  const editContent = useMutation({
    mutationFn: ({ row, content }: { row: ScheduledMessageView; content: string }) =>
      scheduledMessageService.update(row.id, { content, expectedVersion: row.version }),
    onSuccess: () => {
      refresh();
      showToast('success', 'Đã cập nhật nội dung tin hẹn giờ');
    },
    onError,
  });

  const cancel = useMutation({
    mutationFn: (row: ScheduledMessageView) => scheduledMessageService.cancel(row.id),
    onSuccess: () => {
      refresh();
      showToast('success', 'Đã huỷ tin hẹn giờ');
    },
    onError,
  });

  const sendNow = useMutation({
    mutationFn: (row: ScheduledMessageView) => scheduledMessageService.sendNow(row.id),
    onSuccess: () => {
      refresh();
      showToast('success', 'Đã gửi tin');
    },
    onError,
  });

  /** "Gửi lại" tin LỖI: tạo bản hẹn MỚI cùng nội dung/tệp/nhắc tên (bản lỗi giữ nguyên làm lịch sử), ở thời điểm người dùng chọn. */
  const resend = useMutation({
    mutationFn: ({ row, sendAt }: { row: ScheduledMessageView; sendAt: string }) =>
      scheduledMessageService.create(
        { scopeType: row.scopeType, scopeId: row.scopeId, ...(row.threadId ? { threadId: row.threadId } : {}) },
        {
          content: row.content ?? undefined,
          mentions: row.mentions.map((m) => (m.targetId ? { type: m.type, targetId: m.targetId } : { type: m.type })),
          attachmentAssetIds: row.attachments.map((a) => a.assetId),
          ...(row.replyToId ? { replyToId: row.replyToId } : {}),
          sendAt,
          timezone: currentTimeZone(),
        },
      ),
    onSuccess: (view) => {
      refresh();
      showToast('success', `Đã hẹn gửi lại lúc ${formatWhen(view.sendAt)}`);
    },
    onError,
  });

  return { reschedule, editContent, cancel, sendNow, resend };
}

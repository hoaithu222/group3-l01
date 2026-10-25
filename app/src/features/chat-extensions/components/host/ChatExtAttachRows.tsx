import { scopeKeyOf } from '@/core/socket';
import type { ComposerAttachRowsProps } from '@/shared/message-extensions';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

import { useChatSubFeatures } from '../../hooks/useChatSubFeatures';
import { useChatExtIntentStore } from '../../store/chat-ext-intent.store';

/**
 * Dòng thêm vào menu "+" của ô soạn tin (khe `attachRows` của `chat`, p7-04): "Khảo sát" (cờ `polls`) và "Hẹn giờ gửi" (cờ `scheduledMessages`). Cờ tắt ⇒ dòng không xuất hiện (DU-05);
 * ô soạn chỉ có khi người dùng ĐƯỢC GỬI tin ở đây nên "Khảo sát" không cần kiểm quyền gửi riêng (BE vẫn kiểm `POLL_CREATE` → 403 `MSG_004`, tấm hiện lỗi).
 *
 * "Hẹn giờ gửi" dùng chính nội dung đang soạn nên chỉ bấm được khi có gì để gửi (`draft.canSubmit`); khi chưa, dòng vẫn hiện (khám phá được) kèm lời nhắc soạn trước. Đây cũng là đường thay thế
 * của "nhấn giữ nút Gửi" (app.md §7) — không bắt người dùng phải biết cử chỉ ẩn.
 *
 * Mỗi dòng tự mang vạch kẻ TRÊN nó (`border-t`) chứ không phải `divider` của dòng "Tệp" phía trước — xem `AttachMenuSheet`.
 */
export function ChatExtAttachRows({ scope, draft, onDone }: ComposerAttachRowsProps) {
  const { polls, scheduledMessages } = useChatSubFeatures();
  const open = useChatExtIntentStore((state) => state.open);
  const scopeKey = scopeKeyOf(scope.scopeType, scope.scopeId, scope.threadId);
  const act = (fn: () => void) => () => {
    onDone();
    fn();
  };

  return (
    <>
      {polls ? (
        <ListItem
          className="min-h-14 border-t border-divider-1"
          description="Hỏi ý kiến mọi người trong cuộc trò chuyện"
          emphasis="title"
          label="Khảo sát"
          leading={<IconTile name="chart-1" tone="brand" />}
          onPress={act(() => open(scopeKey, { kind: 'poll' }))}
        />
      ) : null}
      {scheduledMessages ? (
        <ListItem
          className="min-h-14 border-t border-divider-1"
          description={draft.canSubmit ? 'Gửi tin đang soạn vào thời điểm bạn chọn' : 'Soạn nội dung trước khi hẹn giờ gửi'}
          disabled={!draft.canSubmit}
          emphasis="title"
          label="Hẹn giờ gửi"
          leading={<IconTile name="timer" tone="accent" />}
          onPress={act(() => open(scopeKey, { kind: 'schedule', draft }))}
        />
      ) : null}
    </>
  );
}

import { scopeKeyOf } from '@/core/socket';
import type { MessageActionRowsProps } from '@/shared/message-extensions';
import { Icon } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';

import { useChatSubFeatures } from '../../hooks/useChatSubFeatures';
import { useChatExtIntentStore } from '../../store/chat-ext-intent.store';

/**
 * Dòng thêm vào menu nhấn giữ tin (khe `actionRows` của `chat`, p7-04):
 *  · "Nhắc lại" — cờ `messageReminders`; mọi tin người dùng/khảo sát chưa thu hồi (BE: cần quyền ĐỌC tin);
 *  · "Tạo task" — cờ `messageToTask`; CHỈ tin người dùng thường (BE `MSG_006` với khảo sát/tin hệ thống);
 *  · "Lưu vào tài liệu" — cờ `messageToResource`; CHỈ tin người dùng thường CÓ tệp đính kèm (BE `MSG_006` với khảo sát/tin hệ thống; `assetIds` phải là tệp của chính tin).
 * Bấm chỉ GHI ý định vào store — menu tự dỡ khi đóng, `ChatExtHost` dựng tấm thật. Cờ tắt ⇒ dòng không xuất hiện (DU-05).
 */
export function ChatExtActionRows({ message, onDone, scope }: MessageActionRowsProps) {
  const { messageReminders, messageToTask, messageToResource } = useChatSubFeatures();
  const open = useChatExtIntentStore((state) => state.open);

  if (message.deleted || message.kind === 'SYSTEM') return null;
  const scopeKey = scopeKeyOf(scope.scopeType, scope.scopeId, scope.threadId);
  const act = (fn: () => void) => () => {
    onDone();
    fn();
  };
  const files = (message.attachments ?? []).map(({ assetId, name }) => ({ assetId, name }));

  return (
    <>
      {messageReminders ? (
        <ListItem
          divider
          label="Nhắc lại"
          leading={<Icon name="noti" />}
          onPress={act(() => open(scopeKey, { kind: 'remind', messageId: message.id }))}
        />
      ) : null}
      {messageToTask && message.kind === 'USER' ? (
        <ListItem
          divider
          label="Tạo task"
          leading={<Icon name="checkmark-square" />}
          onPress={act(() =>
            open(scopeKey, {
              kind: 'task',
              messageId: message.id,
              content: message.content ?? null,
              ...(scope.workspaceId ? { workspaceId: scope.workspaceId } : {}),
            }),
          )}
        />
      ) : null}
      {messageToResource && message.kind === 'USER' && files.length > 0 ? (
        <ListItem
          divider
          label="Lưu vào tài liệu"
          leading={<Icon name="document-2" />}
          onPress={act(() =>
            open(scopeKey, {
              kind: 'resource',
              messageId: message.id,
              attachments: files,
              ...(scope.workspaceId ? { workspaceId: scope.workspaceId } : {}),
            }),
          )}
        />
      ) : null}
    </>
  );
}

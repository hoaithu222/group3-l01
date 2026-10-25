import { Text, View } from 'react-native';

import { useTypingIndicator } from '@/core/socket';
import { useBlockedIds } from '@/shared/hooks/useBlockedIds';
import { Icon } from '@/shared/ui/icon';

import type { ChatScopeRef, ResolveChatAuthor } from '../../api/chat.types';

export interface TypingRowProps {
  scope: ChatScopeRef;
  resolveAuthor?: ResolveChatAuthor;
}

function typingLabel(names: string[]): string {
  if (names.length === 1) return `${names[0]} đang nhập…`;
  if (names.length === 2) return `${names[0]} và ${names[1]} đang nhập…`;
  return `${names[0]} và ${names.length - 1} người khác đang nhập…`;
}

/**
 * "An đang nhập…" cuối danh sách (app.md §3) — bỏ chính mình (`useTypingIndicator` đã lọc) và NGƯỜI MÌNH ĐÃ CHẶN
 * (p1-08 README §2: typing 1-1 server không phát; typing nhóm client lọc theo danh sách chặn).
 */
export function TypingRow({ scope, resolveAuthor }: TypingRowProps) {
  const blockedIds = useBlockedIds();
  const typingUserIds = useTypingIndicator(scope.scopeType, scope.scopeId, scope.threadId).filter(
    (id) => !blockedIds.has(id),
  );
  if (typingUserIds.length === 0) return null;

  const names = typingUserIds.map((id) => resolveAuthor?.(id)?.name ?? 'Ai đó');

  return (
    <View accessibilityLiveRegion="polite" className="flex-row items-center gap-2xs px-md py-2xs">
      {/* Bong bóng "…" nhỏ (trang trí, nghĩa nằm ở chữ bên cạnh) — dáng "đang nhập" quen mắt của mọi app nhắn tin. Tĩnh, không hoạt ảnh:
          dòng này hiện/ẩn theo socket liên tục, chuyển động ở đây là nhiễu và phải đọc thêm cài đặt "giảm chuyển động". */}
      <View className="rounded-full bg-bg-2 px-xs">
        <Icon color="fg-2" name="more2" size={16} />
      </View>
      <Text className="flex-shrink text-caption-sm text-fg-2">{typingLabel(names)}</Text>
    </View>
  );
}

import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

import { mentorSystemText } from '../utils/mentor-system-text';

/** Phần của `MessageView` (chat) mà thẻ cần — khai cấu trúc để KHÔNG import chéo feature `chat` (cùng cách `WalletReminderMessage`). */
export interface MentorSystemMessageLike {
  systemPayload: Record<string, unknown> | null;
  systemType: string | null;
}

/** Cùng hình dạng `ResolveChatAuthor` của `chat` (khai lại theo cấu trúc, cùng lý do trên). */
export type ResolveMentorName = (userId: string) => { name: string } | undefined;

export interface MentorSystemMessageProps {
  message: MentorSystemMessageLike;
  /** Bộ tra `userId → tên` của màn cha (`chat` chuyển qua `SystemRendererContext`). Vắng ⇒ câu không tên. */
  resolveAuthor?: ResolveMentorName;
}

/**
 * Thẻ tin hệ thống của cố vấn trong NHÓM CHAT cố vấn (p6-03 be.md §5): `MENTOR_JOINED` "Cố vấn X tham gia đến 30/10/2026" và
 * `MENTOR_LEFT` "Đợt cố vấn của X đã kết thúc". Do SERVER đăng đúng một lần mỗi đợt (`dedupeKey`), client chỉ vẽ.
 *
 * Nội dung bằng CHỮ (không chỉ icon/màu) và cả thẻ là một cụm cho trình đọc màn hình. Đăng ký vào chat bằng
 * `registerSystemMessageRenderer` ở `shell/chat/register-mentor-cards.tsx` — `chat` KHÔNG import feature này (chat là feature NỀN).
 */
export function MentorSystemMessage({ message, resolveAuthor }: MentorSystemMessageProps) {
  const payload = message.systemPayload;
  const mentorId = typeof payload?.mentorId === 'string' ? payload.mentorId : null;
  const name = mentorId ? resolveAuthor?.(mentorId)?.name : undefined;
  const text = mentorSystemText(message.systemType, payload, name);
  if (text === null) return null;

  const joined = message.systemType === 'MENTOR_JOINED';

  return (
    <View
      accessibilityLabel={text}
      accessible
      className="mx-md my-2xs flex-row items-center gap-sm self-center rounded-md bg-bg-2 px-md py-sm"
    >
      <Icon color={joined ? 'fg-brand' : 'fg-2'} name={joined ? 'user-add' : 'logout'} size={20} />
      <Text className="shrink text-label-md text-fg-1">{text}</Text>
    </View>
  );
}

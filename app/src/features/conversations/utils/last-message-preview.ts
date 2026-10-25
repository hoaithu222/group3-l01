import { callSummaryPreview } from '@/shared/calls';

import type { ConversationListItemLastMessage } from '../api/conversations.types';

const ATTACHMENT_LABELS: Record<string, string> = {
  IMAGE: '[Ảnh]',
  VIDEO: '[Video]',
  VOICE: '[Tin nhắn thoại]',
  AUDIO: '[Âm thanh]',
  FILE: '[Tệp đính kèm]',
};

/**
 * app.md §3/§8 — dòng xem trước ở `ConversationRow`: "Bạn: …" khi tin cuối là
 * của chính mình, nhãn `[Ảnh]`/`[Tệp]`/… khi có đính kèm (server đã excerpt
 * text ở `preview` nhưng đính kèm không có chữ để excerpt), câu trung tính khi
 * đã thu hồi, và NGUYÊN VĂN `preview` cho tin hệ thống (server đã dựng sẵn qua
 * `excerptOf()`, be.md §4 — không thêm "Bạn:" cho tin hệ thống).
 */
export function lastMessagePreview(
  lastMessage: ConversationListItemLastMessage | null,
  currentUserId: string | undefined,
): string {
  if (!lastMessage) return '';
  if (lastMessage.deleted) return 'Tin nhắn đã được thu hồi';
  if (lastMessage.systemType === 'CALL_SUMMARY') return callSummaryPreview(lastMessage.systemPayload, currentUserId);
  if (lastMessage.kind === 'SYSTEM') return lastMessage.preview;

  const isMine = lastMessage.authorId !== null && lastMessage.authorId === currentUserId;
  const body = lastMessage.attachmentKind ? (ATTACHMENT_LABELS[lastMessage.attachmentKind] ?? '[Tệp đính kèm]') : lastMessage.preview;
  return isMine ? `Bạn: ${body}` : body;
}

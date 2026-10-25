import type { ComposerDraftSnapshot } from '@/shared/message-extensions';

import type { MessageMention } from '../../api/chat.types';
import { toMentionInputs } from '../../mentions/mention-markup';
import type { ComposerTarget } from '../../store/composer.store';

/**
 * Bản chụp ô soạn tin đưa cho khe `attachRows` (`@/shared/message-extensions`, p7-04 "Hẹn giờ gửi"): đúng những gì `handleSend` sẽ gửi
 * (nội dung đã tuần tự hoá + đã cắt khoảng trắng, nhắc tên ở dạng DTO — `targetId` VẮNG MẶT chứ không `null`, tệp đã sẵn sàng, tin đang trả lời).
 *
 * `canSubmit` = `canSend` mà KHÔNG đang sửa tin: hẹn giờ một bản SỬA vô nghĩa (sửa là ghi đè tin đã có). `consume` = `resetComposer` — tiện ích gọi SAU khi
 * đã nhận nội dung đi (hẹn thành công) để chữ/tệp/nháp biến mất như sau khi gửi; thất bại thì không gọi nên người dùng không mất chữ đang soạn.
 */
export function toDraftSnapshot(input: {
  serialized: { content: string; mentions: MessageMention[] };
  readyAssets: readonly { assetId?: string | null }[];
  target: ComposerTarget | undefined;
  canSend: boolean;
  consume: () => void;
}): ComposerDraftSnapshot {
  const { serialized, readyAssets, target, canSend, consume } = input;
  return {
    content: serialized.content.trim(),
    mentions: (toMentionInputs(serialized.mentions) ?? []).map((m) => ({ ...m })),
    attachmentAssetIds: readyAssets.flatMap((a) => (a.assetId ? [a.assetId] : [])),
    ...(target?.type === 'reply' ? { replyToId: target.messageId } : {}),
    canSubmit: canSend && target?.type !== 'edit',
    consume,
  };
}

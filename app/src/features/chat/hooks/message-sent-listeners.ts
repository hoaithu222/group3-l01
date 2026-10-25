import type { MessageView } from '../api/chat.types';

type MessageSentListener = (view: MessageView) => void;

const listeners = new Set<MessageSentListener>();

/**
 * Cho feature khác (danh sách hội thoại) biết NGAY khi HTTP gửi tin thành công, không phải đợi `conversation:activity` đi vòng
 * outbox → worker → socket (chậm khi BE xa) — quay lại danh sách là phải thấy tin vừa gửi. Trả hàm huỷ đăng ký.
 */
export function subscribeMessageSent(listener: MessageSentListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyMessageSent(view: MessageView): void {
  for (const listener of listeners) listener(view);
}

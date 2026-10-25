import { Fragment, type ReactNode } from 'react';

import {
  getChatRoomHosts,
  getComposerAttachRows,
  getComposerTops,
  getMessageActionRows,
  getMessageBodies,
  getMessageBubbleFooters,
} from './message-extensions.registry';
import type {
  ChatRoomHostProps,
  ComposerAttachRowsProps,
  ComposerTopProps,
  MessageActionRowsProps,
  MessageBodyProps,
  MessageBubbleFooterProps,
} from './message-extensions.types';

/**
 * Các khe mà `chat` vẽ. Chưa đăng ký renderer nào (cờ tắt, test) ⇒ trả `null` — bong bóng/tấm thao tác/ô soạn giữ nguyên hình dạng cũ.
 * Mỗi renderer do feature nguồn tự kiểm điều kiện áp dụng và trả `null` khi không thuộc về nó.
 */
export function MessageBubbleFooterSlot(props: MessageBubbleFooterProps): ReactNode {
  return getMessageBubbleFooters().map(([id, render]) => (
    <Fragment key={id}>{render(props)}</Fragment>
  ));
}

export function MessageActionRowsSlot(props: MessageActionRowsProps): ReactNode {
  return getMessageActionRows().map(([id, render]) => (
    <Fragment key={id}>{render(props)}</Fragment>
  ));
}

export function ChatRoomHostSlot(props: ChatRoomHostProps): ReactNode {
  return getChatRoomHosts().map(([id, render]) => <Fragment key={id}>{render(props)}</Fragment>);
}

export function ComposerAttachRowsSlot(props: ComposerAttachRowsProps): ReactNode {
  return getComposerAttachRows().map(([id, render]) => (
    <Fragment key={id}>{render(props)}</Fragment>
  ));
}

export function ComposerTopSlot(props: ComposerTopProps): ReactNode {
  return getComposerTops().map(([id, render]) => <Fragment key={id}>{render(props)}</Fragment>);
}

/**
 * Thân bong bóng THAY THẾ: trả nội dung của renderer ĐẦU TIÊN không trả `null`, hoặc `null` khi không ai nhận (`chat` vẽ thân mặc định).
 * Là HÀM chứ không phải component (khác các khe trên): `MessageBubble` cần biết "có ai nhận không" để đổi cả nền/khung của bong bóng,
 * mà một component trả `null` thì cha không đọc được điều đó.
 */
export function renderMessageBody(props: MessageBodyProps): ReactNode {
  for (const [, render] of getMessageBodies()) {
    const node = render(props);
    if (node !== null && node !== undefined && node !== false) return node;
  }
  return null;
}

/**
 * Mặt tiền công khai của `chat` — feature NỀN (app.md §1): `channels` (p1-03),
 * `conversations` (p1-05), `threads` (p1-06) ghép `<ChatRoom scope={...} />`
 * vào màn hình của chính chúng qua ĐÂY, không đào sâu vào `components/`/`hooks/`
 * nội bộ (ngoại lệ đã ghi ở `docs/rules/feature-structure.md`).
 */
export { ChatRoom } from './components/ChatRoom';
export type { ChatRoomProps } from './components/ChatRoom';

export { useChatScope } from './hooks/useChatScope';

export type {
  ChatAuthorInfo,
  ChatScopeRef,
  ChatScopeType,
  ForwardTargetOption,
  MessageView,
  ResolveChatAuthor,
} from './api/chat.types';
export type { ComposerCapabilities } from './components/composer/Composer';

/**
 * Ba export dưới đây MỞ RỘNG mặt tiền cho `conversations` (p1-05,
 * `DraftDirectScreen`) — get-or-create-rồi-gửi tin ĐẦU không thể đi qua
 * `<ChatRoom>` (chưa có `scopeId` thật lúc người dùng gõ), nên màn đó tự gọi
 * `POST /conversations/:id/messages` (alias be.md §4) rồi cần CÙNG cơ chế
 * outbox/`clientMessageId` mà `ChatRoom` dùng để bong bóng FAILED có thể "Thử
 * lại" bình thường sau khi điều hướng sang `ConversationScreen` thật — không
 * phải hai máy trạng thái song song (`docs/rules/feature-structure.md`
 * "Ngoại lệ: chat là feature NỀN").
 */
export { useOutboxStore } from './store/outbox.store';
export type { PendingMessage, PendingMessageStatus } from './store/outbox.store';
export { newClientMessageId } from './utils/client-message-id';
/** `conversations` cần đúng khoá cache tin nhắn để `removeQueries` khi `hiddenBeforeSeq` tăng (app.md p1-05 §4.2) — không tự ghép chuỗi khoá song song ở feature khác. */
export { chatKeys } from './api/chat.keys';

/**
 * Mở rộng cho `threads` (p1-06): màn luồng dựng lại tin GỐC bằng đúng renderer của bong bóng
 * (markdown-lite + chip nhắc tên) và nghe cùng payload `thread:updated` mà cache tin nhắn dùng —
 * không tự viết bản thứ hai (`docs/rules/feature-structure.md` "chat là feature NỀN").
 */
export { TextContent } from './components/bubble/TextContent';
export { previewText } from './utils/preview-text';
export { pinnedExcerpt } from './utils/pinned-excerpt';
export type { ThreadUpdatedEvent } from './cache/chat-socket-events.types';
export type { MessageMention } from './api/chat.types';
/**
 * `content`/`excerpt`/`preview` từ server còn marker nhắc tên thô (`@{u:<id>}`, BE `excerptOf` không thay) — nơi nào
 * hiện lại chữ đó ngoài bong bóng (danh sách hội thoại, thông báo…) dùng hàm này để ra `@Tên`, không in id.
 */
export { mentionsToPlainText } from './mentions/mention-markup';

/**
 * Điểm mở rộng tin hệ thống cho module ngoài (p6-04 ví nhóm đăng ký `WALLET_REMINDER`) — chat KHÔNG
 * import ngược module đó; nơi lắp ráp (`app/(app)/_layout.tsx`) gọi hàm này lúc khởi động.
 */
export { subscribeMessageSent } from './hooks/message-sent-listeners';
export { registerSystemMessageRenderer } from './components/system/system-renderer.registry';
export type {
  SystemMessageRenderer,
  SystemRendererContext,
} from './components/system/system-renderer.registry';

/**
 * Mở rộng cho `chat-extensions` (p7-04): khảo sát là tin `kind = 'POLL'` nằm TRONG cache tin nhắn — bầu lạc quan, `poll:updated` và chèn tin khảo sát vừa tạo đều
 * vá đúng cache đó bằng các hàm thuần này (không tự viết bản thứ hai của cấu trúc trang/`seq`). Chiều ngược (`chat` → `chat-extensions`) CẤM: đi qua khe
 * `@/shared/message-extensions`.
 */
export {
  appendToLatestPage,
  flattenMessages,
  isCaughtUpToLatest,
  patchMessageById,
} from './cache/message-pages';
export type { MessagesData } from './cache/message-pages';
/** Đếm theo grapheme khớp BE (`graphemeLength`) — khảo sát kiểm độ dài câu hỏi/lựa chọn theo đúng cách BE đếm. */
export { graphemeLength } from './utils/grapheme';

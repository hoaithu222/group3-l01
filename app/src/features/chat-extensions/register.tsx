import {
  registerChatRoomHost,
  registerComposerAttachRows,
  registerComposerTop,
  registerMessageActionRows,
  registerMessageBody,
  registerMessageBubbleFooter,
} from '@/shared/message-extensions';

import { ChatExtActionRows } from './components/host/ChatExtActionRows';
import { ChatExtAttachRows } from './components/host/ChatExtAttachRows';
import { ChatExtHost } from './components/host/ChatExtHost';
import { ScheduledBanner } from './components/host/ScheduledBanner';
import { SourceRefsFooter } from './components/host/SourceRefsFooter';
import { PollBody } from './components/poll/PollBody';

/**
 * Đăng ký `chat-extensions` (p7-04) vào các khe mở rộng của `chat` (`@/shared/message-extensions`) — `chat` KHÔNG import feature này. Import module này MỘT lần (side-effect) ở nơi lắp ráp
 * (`shell/chat/register-chat-extensions.ts`, nạp từ `app/_layout.tsx`) TRƯỚC khi danh sách tin vẽ lần đầu; đăng ký lặp cùng `id` chỉ ghi đè nên an toàn với Fast Refresh.
 *
 * Mỗi renderer là HÀM không có hook: nó chỉ trả một PHẦN TỬ của component (component mới tự đọc cờ phụ `useFeature`) hoặc `null` khi tin/phạm vi không thuộc về nó. Cờ tắt ⇒ component trả `null`
 * — bong bóng, menu và ô soạn giữ nguyên hình dạng cũ (DU-05).
 */
const ID = 'chat-extensions';

registerMessageBody(ID, (props) =>
  props.message.kind === 'POLL' && props.message.poll ? <PollBody {...props} /> : null,
);
registerMessageBubbleFooter(ID, (props) =>
  (props.message.sourceRefs?.length ?? 0) > 0 && !props.message.deleted ? <SourceRefsFooter {...props} /> : null,
);
registerMessageActionRows(ID, (props) => <ChatExtActionRows {...props} />);
registerComposerAttachRows(ID, (props) => <ChatExtAttachRows {...props} />);
registerComposerTop(ID, (props) => <ScheduledBanner {...props} />);
registerChatRoomHost(ID, (props) => <ChatExtHost {...props} />);

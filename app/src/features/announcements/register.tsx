import {
  registerChatRoomHost,
  registerMessageActionRows,
  registerMessageBubbleFooter,
} from '@/shared/message-extensions';

import { AnnouncementActionRows } from './components/AnnouncementActionRows';
import { AnnouncementFooter } from './components/AnnouncementFooter';
import { AnnouncementHost } from './components/AnnouncementHost';
import { isAnnounceable, isChannelRoot } from './utils/announcement-scope';

/**
 * Đăng ký `announcements` vào các khe mở rộng tin nhắn của `chat` (`@/shared/message-extensions`) — `chat`/`channels` KHÔNG
 * import feature này. Import module này một lần (side-effect) ở nơi lắp ráp TRƯỚC khi danh sách tin vẽ lần đầu; đăng ký
 * lặp cùng `id` chỉ ghi đè nên an toàn với Fast Refresh. Mỗi renderer tự kiểm điều kiện áp dụng (kênh + luồng chính +
 * tin gốc) và trả `null` khi không thuộc về nó — hội thoại/màn luồng giữ nguyên hình dạng cũ.
 */
const ID = 'announcements';

registerMessageBubbleFooter(ID, (props) =>
  isAnnounceable(props.message, props.scope) ? <AnnouncementFooter {...props} /> : null,
);

registerMessageActionRows(ID, (props) =>
  isChannelRoot(props.scope) ? <AnnouncementActionRows {...props} /> : null,
);

registerChatRoomHost(ID, (props) =>
  isChannelRoot(props.scope) ? <AnnouncementHost {...props} /> : null,
);

import { registerSystemMessageRenderer } from '@/features/chat';
import { MentorSystemMessage } from '@/features/mentor';

/**
 * p6-03: thẻ tin hệ thống `MENTOR_JOINED` ("Cố vấn X tham gia đến …") và `MENTOR_LEFT` ("Đợt cố vấn … đã kết thúc") trong nhóm chat cố vấn.
 * Thiếu hai dòng đăng ký này thì thẻ rơi về "Nội dung chưa hỗ trợ trên phiên bản này".
 *
 * Đăng ký Ở ĐÂY (nơi lắp ráp — `app/(app)/_layout.tsx` import file này như một side-effect, module scope) vì `chat` và `mentor` là hai
 * feature không import nhau; đăng ký trong effect của một màn thì tin hệ thống ĐẦU TIÊN vẫn ra "chưa hỗ trợ" (xem `system-renderer.registry.ts`).
 * Cùng khuôn `register-meeting-cards.tsx`; đăng ký lặp cùng loại là ghi đè nên Fast Refresh an toàn.
 *
 * Tên cố vấn lấy từ `context.resolveAuthor` — bộ tra của màn cha đang đưa cho `ChatRoom` (nhóm chat cố vấn: danh sách thành viên hội thoại),
 * cùng nguồn với dòng `MEMBER_JOINED`. Tra không ra (cố vấn đã rời nhóm chat) ⇒ câu không tên.
 */
registerSystemMessageRenderer('MENTOR_JOINED', (message, context) => (
  <MentorSystemMessage message={message} resolveAuthor={context?.resolveAuthor} />
));
registerSystemMessageRenderer('MENTOR_LEFT', (message, context) => (
  <MentorSystemMessage message={message} resolveAuthor={context?.resolveAuthor} />
));

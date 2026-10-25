import { registerSystemMessageRenderer } from '@/features/chat';
import { MeetingRecapMessage, MeetingRecordingReadyMessage } from '@/features/meeting-recap';

/**
 * p2-06: thẻ tin hệ thống `MEETING_RECAP` ("Biên bản: … — Xem biên bản") và `MEETING_RECORDING_READY` ("Bản ghi cuộc họp đã sẵn sàng — Xem")
 * trong nhóm chat của cuộc họp. Thiếu hai dòng đăng ký này thì thẻ rơi về "Nội dung chưa hỗ trợ trên phiên bản này".
 *
 * Đăng ký Ở ĐÂY (nơi lắp ráp — `app/(app)/_layout.tsx` import file này như một side-effect, module scope) vì `chat` và `meeting-recap` là hai
 * feature không import nhau; và đăng ký trong effect của một màn thì tin hệ thống ĐẦU TIÊN vẫn ra "chưa hỗ trợ" (xem `system-renderer.registry.ts`).
 * Tách khỏi `_layout.tsx` (đã chạm trần độ dài file) — cùng vai `WALLET_REMINDER`/`CALL_SUMMARY` đăng ký ngay trong layout. Đăng ký lặp cùng loại
 * là ghi đè, nên Fast Refresh an toàn.
 *
 * `MEETING_STARTED`/`MEETING_REMINDER` chưa có thẻ riêng ở kế hoạch nào (p2-04/p2-05/p2-06 không nêu) — vẫn là dòng "chưa hỗ trợ".
 */
registerSystemMessageRenderer('MEETING_RECAP', (message) => (
  <MeetingRecapMessage message={message} />
));
registerSystemMessageRenderer('MEETING_RECORDING_READY', (message) => (
  <MeetingRecordingReadyMessage message={message} />
));

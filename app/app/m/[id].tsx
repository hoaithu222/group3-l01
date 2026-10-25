import { Redirect, useLocalSearchParams } from 'expo-router';

import { MeetingCodeLinkScreen } from '@/features/meetings/screens/MeetingCodeLinkScreen';
import { normalizeMeetingCode } from '@/features/meetings/utils/meeting-link';

/**
 * `https://<domain>/m/<x>` — MỘT đường dẫn ngắn cho HAI thứ, phân loại theo HÌNH DẠNG của `<x>` (D-29):
 *  · mã họp `abc-defg-hij` (link chia sẻ ở chi tiết cuộc họp) ⇒ giải mã rồi mở cuộc họp (`MeetingCodeLinkScreen`);
 *  · còn lại (ObjectId 24 ký tự hex của hội thoại, không có dấu `-`) ⇒ mở thẳng cuộc trò chuyện như trước (app.md p1-05 §1).
 * Ngoài nhóm `(app)` (cùng mẫu `app/invite/[code].tsx`) — chỉ chuyển tiếp; hàng rào đăng nhập của `(app)/_layout.tsx` áp dụng ở
 * route đích, còn nhánh mã họp tự chặn ở `MeetingCodeLinkScreen`.
 */
export default function ShortLinkRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const meetingCode = normalizeMeetingCode(id ?? '');

  if (meetingCode) return <MeetingCodeLinkScreen code={meetingCode} />;
  return <Redirect href={{ pathname: '/messages/[conversationId]', params: { conversationId: id } }} />;
}

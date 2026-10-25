import type { ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';

import { BottomSheet } from '@/shared/ui/bottom-sheet';

/** Tỉ lệ chiều cao tấm chat so với màn (app.md §3: 70 %) — chừa dải nền mờ để người dùng thấy mình vẫn ở trong phòng. */
const SHEET_HEIGHT_RATIO = 0.7;

export interface RoomChatSheetProps {
  channelId: string;
  onClose: () => void;
  /**
   * Nội dung chat của kênh do NƠI LẮP RÁP cấp (route `call/[callId]`): `calls` không import feature `chat` (không import chéo feature),
   * và chat phòng là tin của CHÍNH kênh VOICE — lịch sử còn nguyên sau phiên.
   * ⚠️ Khối trả về phải tự `flex-1` (như `ChatRoom`): thân tấm đã giãn sẵn, nhưng con không `flex-1` chỉ cao theo nội dung của nó.
   */
  renderChat: (channelId: string) => ReactNode;
  visible: boolean;
}

/** Chat phòng trong tấm trượt 70 % chiều cao (điện thoại). Máy tính bảng dùng khung cạnh lưới — xem `VoiceRoomScreen`. */
export function RoomChatSheet({ channelId, onClose, renderChat, visible }: RoomChatSheetProps) {
  const { height } = useWindowDimensions();
  return (
    <BottomSheet
      /* ⛔ `flex-1` BẮT BUỘC: `height` chỉ khoá chiều cao TẤM, còn thân KHÔNG cuộn của `BottomSheet` cao theo NỘI DUNG (slot `body`
         rỗng) — mà `ChatRoom` là `flex-1`, không có chiều cao riêng ⇒ cả khối chat sập về ~0: ô soạn dạt lên ngay dưới tiêu đề, trạng
         thái rỗng tràn ra vẽ đè lên tiêu đề, phần dưới tấm trắng trơn (đã gặp trên máy thật). Giãn thân thì danh sách tin chiếm hết chỗ
         và ô soạn dính đáy tấm — cùng cách `MeetingChatSheet`. ✅ Không cần `View flex-1` bọc thêm: `ChatRoom` nằm thẳng trong thân. */
      bodyClassName="flex-1"
      height={Math.round(height * SHEET_HEIGHT_RATIO)}
      padded={false}
      title="Chat của phòng"
      visible={visible}
      onClose={onClose}
    >
      {visible ? renderChat(channelId) : null}
    </BottomSheet>
  );
}

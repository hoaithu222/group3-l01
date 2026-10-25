import { useContext, useEffect } from 'react';
import { View } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { useRoomSubscription } from '@/core/socket';
import { ChatRoom, useChatScope } from '@/features/chat';
import { SPACING, useBreakpoint } from '@/shared/theme';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { EmptyState } from '@/shared/ui/empty-state';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';

import { useMeetingChatData } from './useMeetingChatData';

/** Tấm chat cao 85% màn — chừa dải nền mờ phía trên để người dùng thấy mình vẫn đang ở phòng họp (Figma ghi trần 742/812 ≈ 91%). */
const SHEET_HEIGHT_RATIO = 0.85;
/** Sàn chiều cao khi bàn phím mở trên máy thấp/xoay ngang: đủ tiêu đề + vài dòng tin + ô soạn. */
const MIN_SHEET_HEIGHT = 240;
/** Ba hàng giữ chỗ lúc chờ quyền gửi tin. */
const LOADING_ROWS = [0, 1, 2] as const;

/**
 * Chiều cao tấm theo bàn phím. ⛔ `BottomSheet` nâng tấm bằng `paddingBottom` = chiều cao bàn phím, còn `height` cố định thì KHÔNG co:
 * 85% màn + bàn phím ~300dp vượt chiều cao màn ⇒ hàng tiêu đề + nút ✕ bị đẩy lên khỏi mép trên (không đóng được tấm lúc đang gõ).
 * Co tấm lại cho vừa phần còn trống phía trên bàn phím (trừ vùng an toàn trên + một khe), sàn `MIN_SHEET_HEIGHT`.
 */
function useChatSheetHeight(): number {
  const { height } = useBreakpoint();
  const keyboard = useKeyboardState((state) => (state.isVisible ? state.height : 0));
  const top = useContext(SafeAreaInsetsContext)?.top ?? 0;
  const preferred = Math.round(height * SHEET_HEIGHT_RATIO);
  if (keyboard <= 0) return preferred;
  return Math.max(MIN_SHEET_HEIGHT, Math.min(preferred, Math.round(height - keyboard - top - SPACING.xs)));
}

export interface MeetingChatSheetProps {
  /** Chủ trì/đồng chủ trì: chưa có nhóm chat thì thấy nút "Tạo nhóm chat cho cuộc họp". */
  canCreate: boolean;
  /** `Meeting.conversationId`; `null` = chưa có nhóm chat (host chưa bật). */
  conversationId: string | null;
  /** Đang gọi tạo nhóm chat — nút khoá, nhãn "Đang tạo…". */
  creating?: boolean;
  meetingId: string;
  visible: boolean;
  onClose: () => void;
  /** Tạo nhóm chat cho cuộc họp (`POST /meetings/:id/chat-group`). */
  onCreate?: () => void;
}

/**
 * Tấm chat trong phòng họp (app.md p2-05 §3.2 `MeetingChatSheet`): ghép `ChatRoom` (feature nền `chat`, ngoại lệ DUY NHẤT được import chéo)
 * lên `conversationId` của cuộc họp. Stage vẫn nghe âm thanh khi tấm mở; bàn phím do `BottomSheet` né (`keyboard-controller`) và tấm CO
 * theo bàn phím (`useChatSheetHeight`) để tiêu đề + nút ✕ không bị đẩy khỏi màn.
 *
 *  · chưa có nhóm chat ⇒ host thấy "Tạo nhóm chat cho cuộc họp", người khác thấy "Chủ trì chưa bật chat";
 *  · quyền gửi tin (`canWrite`/`readOnlyReason`) lấy từ `chatAccess`, KHÔNG suy từ vai trò họp — người bị khoá chat vẫn đọc được;
 *  · 404/403 (nhóm chat bị xoá, mất quyền) hoặc phòng `conv` bị từ chối ⇒ tự đóng tấm qua `onClose`.
 *
 * ⚠️ `useRoomSubscription` cùng khoá với `ChatRoom` nên refcount chỉ sinh MỘT `room:join`; ở đây chỉ để bắt trạng thái `denied`.
 */
export function MeetingChatSheet({
  canCreate,
  conversationId,
  creating = false,
  meetingId,
  visible,
  onClose,
  onCreate,
}: MeetingChatSheetProps) {
  const sheetHeight = useChatSheetHeight();
  const room = useRoomSubscription('conv', conversationId, {
    enabled: visible && conversationId !== null,
  });
  const data = useMeetingChatData(meetingId, conversationId, visible);
  const scope = useChatScope('CONVERSATION', conversationId ?? '');
  const gone = data.forbidden || room.status === 'denied';

  useEffect(() => {
    if (visible && gone) onClose();
  }, [visible, gone, onClose]);

  return (
    <BottomSheet
      bodyClassName="flex-1"
      height={sheetHeight}
      padded={false}
      title="Trò chuyện"
      visible={visible}
      onClose={onClose}
    >
      {conversationId === null ? (
        <EmptyState
          actions={
            canCreate && onCreate
              ? [
                  {
                    disabled: creating,
                    label: creating ? 'Đang tạo…' : 'Tạo nhóm chat cho cuộc họp',
                    onPress: onCreate,
                  },
                ]
              : undefined
          }
          description={
            canCreate
              ? 'Cuộc họp chưa có nhóm chat. Tạo nhóm để mọi người nhắn tin ngay trong lúc họp.'
              : 'Chủ trì chưa bật chat'
          }
          fullscreen
          icon="chat-bubble"
          tone="info"
        />
      ) : gone ? (
        // Đang đóng: đừng dựng `ChatRoom` — nó sẽ gọi tải tin của một hội thoại đã mất quyền và nháy lỗi ngay trước khi tấm đóng.
        <EmptyState
          description="Cuộc trò chuyện này không còn khả dụng."
          fullscreen
          icon="chat-bubble"
          tone="neutral"
        />
      ) : data.loading ? (
        // Giữ chỗ cùng dáng hàng tin nhắn (ảnh tròn + đoạn chữ) thay cho hai khối xám trơn — nhìn là biết đang tải cuộc trò chuyện.
        <View className="gap-md p-md">
          {LOADING_ROWS.map((row) => (
            <SkeletonParagraphWithIcon key={row} />
          ))}
        </View>
      ) : (
        <ChatRoom
          capabilities={{ canWrite: data.canWrite, readOnlyReason: data.readOnlyReason }}
          emptyHint="Chưa có tin nhắn trong cuộc họp"
          resolveAuthor={data.resolveAuthor}
          scope={scope}
        />
      )}
    </BottomSheet>
  );
}

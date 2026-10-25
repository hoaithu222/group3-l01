import { useState } from 'react';

import { useModerationActions } from '@/shared/hooks/useModerationActions';
import { MessageActionRowsSlot, useMessageExtensionScope } from '@/shared/message-extensions';
import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { Icon } from '@/shared/ui/icon';
import { ListItem, ListItemDefaultsProvider } from '@/shared/ui/list';
import { Dialog } from '@/shared/ui/modal';

import type { MessageView } from '../../api/chat.types';
import { buildMessageActionRows, type MessageActionRow } from './message-action-rows';
import { QuickReactionBar } from './QuickReactionBar';

export interface MessageActionSheetProps {
  visible: boolean;
  message: MessageView | undefined;
  onClose: () => void;
  onReply: (message: MessageView) => void;
  onForward: (message: MessageView) => void;
  onEdit: (message: MessageView) => void;
  onRecall: (message: MessageView) => void;
  onHide: (message: MessageView) => void;
  onPin: (message: MessageView) => void;
  onUnpin: (message: MessageView) => void;
  onToggleReaction: (message: MessageView, emoji: string) => void;
  /** Mở chọn cảm xúc ngoài bộ nhanh — vắng mặt thì thanh nhanh không có nút "+". */
  onMoreReactions?: (message: MessageView) => void;
  /**
   * Mở màn luồng của tin này. CHỈ truyền khi phạm vi có luồng (kênh, luồng chính) — hội thoại BE
   * từ chối bằng `MSG_018`, nên ở đó mục này KHÔNG hiện chứ không phải hiện rồi báo lỗi.
   * Mở màn không gọi API nào (TH-02: đóng ngay thì không sinh `Thread`).
   */
  onOpenThread?: (message: MessageView) => void;
  /**
   * Lưu/Bỏ lưu (p1-09) — CHỈ truyền khi nơi gọi nối được cơ chế lưu (`ChatRoom` dùng `@/shared/saved`); vắng mặt thì mục
   * này không hiện. `isSaved` quyết định nhãn "Lưu" / "Bỏ lưu": `MessageView` chưa có cờ `isSaved` nên nơi gọi tự theo dõi.
   */
  onToggleSave?: (message: MessageView) => void;
  isSaved?: boolean;
}

/** Hàng `ListItem` của menu. `emphasis` bỏ trống ở hàng thường ⇒ ăn `title` của `ListItemDefaultsProvider` bọc ngoài. */
function renderRow(row: MessageActionRow, divider: boolean) {
  return (
    <ListItem
      key={row.key}
      divider={divider}
      emphasis={row.danger ? 'danger' : undefined}
      label={row.label}
      leading={
        <Icon color={row.danger ? 'error' : undefined} name={row.icon} variant={row.iconVariant} />
      }
      onPress={row.onPress}
    />
  );
}

/**
 * Nhấn giữ bong bóng / nút "…" — thanh cảm xúc nhanh + hành động theo
 * `myPermissions` (app.md §3). Danh sách hàng (ai thấy hàng nào, thứ tự) ở `buildMessageActionRows`
 * (`message-action-rows.ts`); "Báo cáo" (p1-08) mở tấm Báo cáo của `moderation` qua store chung.
 */
export function MessageActionSheet({
  visible,
  message,
  onClose,
  onReply,
  onForward,
  onEdit,
  onRecall,
  onHide,
  onPin,
  onUnpin,
  onToggleReaction,
  onMoreReactions,
  onOpenThread,
  onToggleSave,
  isSaved = false,
}: MessageActionSheetProps) {
  const [confirmingRecall, setConfirmingRecall] = useState(false);
  // p1-08: `chat` không import `moderation` — chỉ "yêu cầu" mở tấm Báo cáo qua store chung (`ModerationHost` dựng nó).
  const { reportMessage } = useModerationActions();
  // p5-04: dòng thao tác do feature khác đăng ký (vd "Yêu cầu xác nhận đã đọc") — xem `@/shared/message-extensions`.
  const extensionScope = useMessageExtensionScope();

  if (!message) return null;
  const perms = message.myPermissions;
  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const { lower, upper } = buildMessageActionRows(message, {
    act,
    confirmRecall: () => setConfirmingRecall(true),
    isSaved,
    onEdit,
    onForward,
    onHide,
    onOpenThread,
    onPin,
    onReply,
    onToggleSave,
    onUnpin,
    reportMessage,
  });

  return (
    // `ListItemDefaultsProvider emphasis="title"` (thay cho `<>`): nhãn hàng là chữ CHÍNH (fg-1) như mọi `ActionMenuSheet` — mặc định của
    // `ListItem` là nhãn xám của hàng nhãn–giá trị, làm menu này nhạt hơn hẳn các menu khác (kể cả hàng do feature khác đăng ký qua khe).
    <ListItemDefaultsProvider emphasis="title">
      {/* `padded={false}` + `SheetList`: cả thanh cảm xúc lẫn hàng `ListItem` có kẻ ngăn cùng nằm trong lề 16. Thân `padded` mặc định chèn
          khe 8 giữa các hàng có kẻ (hở ra một dải trắng); `QuickReactionBar` không còn tự khai `px-md` (thụt 32dp). */}
      <BottomSheet padded={false} scrollable snapToContent visible={visible} onClose={onClose}>
        <SheetList accessibilityRole="menu" className="pb-md">
          <QuickReactionBar
            myReaction={message.reactions.find((r) => r.me)?.emoji}
            onMore={
              perms.canReact && onMoreReactions ? act(() => onMoreReactions(message)) : undefined
            }
            onSelect={(emoji) => act(() => onToggleReaction(message, emoji))()}
          />
          {/* Kẻ ngăn: nhóm TRÊN luôn có hàng đi sau ("Ẩn phía tôi" không bao giờ ẩn) ⇒ mọi hàng đều kẻ; nhóm DƯỚI bỏ kẻ ở hàng
              CUỐI đang hiện — bản cũ kẻ cứng từng hàng nên thiếu quyền thu hồi là "Báo cáo"/"Xem chi tiết giờ" treo một vạch cụt. */}
          {upper.map((row) => renderRow(row, true))}
          {extensionScope ? (
            <MessageActionRowsSlot message={message} scope={extensionScope} onDone={onClose} />
          ) : null}
          {lower.map((row, index) => renderRow(row, index < lower.length - 1))}
        </SheetList>
      </BottomSheet>

      <Dialog
        description="Mọi người sẽ thấy tin nhắn này đã được thu hồi. Không thể hoàn tác."
        primaryAction={{ label: 'Thu hồi', onPress: act(() => onRecall(message)) }}
        secondaryAction={{ label: 'Huỷ', onPress: () => setConfirmingRecall(false) }}
        title="Thu hồi tin nhắn này?"
        variant="warning"
        visible={confirmingRecall}
        onClose={() => setConfirmingRecall(false)}
      />
    </ListItemDefaultsProvider>
  );
}

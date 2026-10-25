import { useState } from 'react';
import { View } from 'react-native';

import { BoardHeaderActionsSlot } from '@/shared/board-extensions';
import { ActionMenu, type ActionMenuItem } from '@/shared/ui/action-menu';
import { Button } from '@/shared/ui/button';

import { DuplicateBoardSheet } from '../DuplicateBoardSheet';

export interface KanbanHeaderActionsProps {
  boardId: string;
  boardName?: string;
  /** Tạo bảng trong nhóm (OWNER/ADMIN, nhóm đang hoạt động — `canCreateBoard`) ⇒ có "Nhân bản bảng". */
  canDuplicate: boolean;
  /** Cờ phân hệ `project` bật ⇒ có "Dòng thời gian". */
  canOpenTimeline: boolean;
  /** `BOARD_EDIT` ⇒ có "Cài đặt bảng". */
  canOpenSettings: boolean;
  wsId: string;
  onOpenSettings: () => void;
  onOpenTimeline: () => void;
}

/**
 * Hai khe bên phải `AppBar` của Kanban. `AppBar` chỉ có 2 khe (bản vẽ) — trước đây ba nút icon (Dòng thời gian · nút của feature
 * khác · Cài đặt) bóp tiêu đề bảng còn vài chữ. Quy ước: nút feature khác đăng ký qua khe `@/shared/board-extensions` (vd
 * "Báo cáo đóng góp") giữ làm icon; hành động của chính `boards` (Dòng thời gian, Cài đặt bảng, Nhân bản bảng) gom vào MỘT menu "⋯" khi có
 * từ hai hành động trở lên. Chỉ còn MỘT hành động (thành viên thường: chỉ có Dòng thời gian) thì vẽ thẳng icon — menu một hàng
 * bắt người dùng bấm hai lần cho việc thường dùng nhất.
 *
 * "Nhân bản bảng" (p3-02 P1) mở `DuplicateBoardSheet` — tấm này do CHÍNH component này giữ (state mở/đóng) để `KanbanScreen` không phình thêm.
 */
export function KanbanHeaderActions({
  boardId,
  boardName,
  canDuplicate,
  canOpenSettings,
  canOpenTimeline,
  wsId,
  onOpenSettings,
  onOpenTimeline,
}: KanbanHeaderActionsProps) {
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const canCopy = canDuplicate && Boolean(boardName);
  const items: ActionMenuItem[] = [
    { hidden: !canOpenTimeline, icon: 'calendar', key: 'timeline', label: 'Dòng thời gian', onPress: onOpenTimeline },
    { hidden: !canOpenSettings, icon: 'setting', key: 'settings', label: 'Cài đặt bảng', onPress: onOpenSettings },
    // `ActionMenu` đóng tấm rồi mới chạy `onPress` nên tấm sao chép mở sau, không tranh cửa sổ với menu.
    { hidden: !canCopy, icon: 'copy', key: 'duplicate', label: 'Nhân bản bảng', onPress: () => setDuplicateOpen(true) },
  ];
  const shown = items.filter((item) => !item.hidden);
  const single = shown.length === 1 ? shown[0] : undefined;

  return (
    <View className="flex-row items-center gap-2xs">
      {/* Lối vào của feature khác (p4-06 "Báo cáo đóng góp") đi qua khe chung — `boards` không import feature đó. */}
      <BoardHeaderActionsSlot boardId={boardId} wsId={wsId} />
      {single ? (
        <Button
          accessibilityLabel={single.label}
          iconLeft={single.icon}
          iconOnly
          size="sm"
          variant="tertiary"
          onPress={single.onPress}
        />
      ) : (
        <ActionMenu accessibilityLabel="Tuỳ chọn bảng" items={items} title={boardName} />
      )}
      {/* Chỉ dựng khi đang mở (cùng cách `MoveTaskSheet`): mỗi lần mở là một lượt mới, state/khoá idempotent điền sẵn lúc dựng. */}
      {canCopy && duplicateOpen ? (
        <DuplicateBoardSheet
          boardId={boardId}
          boardName={boardName ?? ''}
          wsId={wsId}
          onClose={() => setDuplicateOpen(false)}
        />
      ) : null}
    </View>
  );
}

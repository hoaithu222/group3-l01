import { View } from 'react-native';

import { ActionMenu, type ActionMenuItem } from '@/shared/ui/action-menu';

import type { WhiteboardDetail } from '../api/whiteboard.types';
import type { BackgroundKind } from '../engine';
import { PresenceAvatars } from './PresenceAvatars';

export interface CanvasHeaderActionsProps {
  background: BackgroundKind;
  board: WhiteboardDetail;
  /** Có quyền vẽ hiệu lực — quyết việc hiện "Đổi nền". */
  canEdit: boolean;
  onArchive: () => void;
  onBackground: (kind: BackgroundKind) => void;
  onFit: () => void;
  onHistory: () => void;
  onRename: () => void;
  onRestore: () => void;
  onSaveVersion: () => void;
  onShare: () => void;
}

const NEXT_BACKGROUND: Record<BackgroundKind, { kind: BackgroundKind; label: string }> = {
  dots: { kind: 'plain', label: 'Nền trơn' },
  grid: { kind: 'dots', label: 'Nền chấm' },
  plain: { kind: 'grid', label: 'Nền lưới' },
};

/**
 * Hai khe phải của `AppBar` (bản vẽ chỉ có 2): người đang mở + menu "⋯". Hành động theo `myPermissions` do SERVER tính (`GET /whiteboards/:id`): đổi
 * tên/lưu trữ/khôi phục cần `manage`; "Lưu phiên bản" cần `snapshot`. Bảng đã lưu trữ chỉ còn Chia sẻ (xem), Lịch sử, Khôi phục và "Xem toàn bộ".
 * "Xem toàn bộ" (zoom-to-fit) là lối thoát khi người dùng pan lạc khỏi nội dung trên canvas vô cực.
 */
export function CanvasHeaderActions({
  background,
  board,
  canEdit,
  onArchive,
  onBackground,
  onFit,
  onHistory,
  onRename,
  onRestore,
  onSaveVersion,
  onShare,
}: CanvasHeaderActionsProps) {
  const { manage, snapshot } = board.myPermissions;
  const active = board.status === 'ACTIVE';
  const next = NEXT_BACKGROUND[background];

  const items: ActionMenuItem[] = [
    { icon: 'view', key: 'fit', label: 'Xem toàn bộ', onPress: onFit },
    { hidden: !canEdit, icon: 'setting2', key: 'bg', label: next.label, onPress: () => onBackground(next.kind) },
    { hidden: !manage || !active, icon: 'edit', key: 'rename', label: 'Đổi tên', onPress: onRename },
    { icon: 'user-add', key: 'share', label: 'Chia sẻ và cộng tác viên', onPress: onShare },
    { icon: 'history', key: 'history', label: 'Lịch sử phiên bản', onPress: onHistory },
    {
      hidden: !snapshot || !active,
      icon: 'add-circle',
      key: 'save',
      label: 'Lưu phiên bản',
      onPress: onSaveVersion,
    },
    {
      description: 'Chuyển sang chỉ xem, khôi phục lại được',
      hidden: !manage || !active,
      icon: 'file-2',
      key: 'archive',
      label: 'Lưu trữ',
      onPress: onArchive,
    },
    {
      hidden: !manage || active,
      icon: 'reload',
      key: 'restore',
      label: 'Khôi phục bảng',
      onPress: onRestore,
    },
  ];

  return (
    <View className="flex-row items-center gap-2xs">
      <PresenceAvatars />
      <ActionMenu items={items} title={board.name} />
    </View>
  );
}

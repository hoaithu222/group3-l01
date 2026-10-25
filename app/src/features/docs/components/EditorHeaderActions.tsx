import { View } from 'react-native';

import { ActionMenu, type ActionMenuItem } from '@/shared/ui/action-menu';

import type { DocumentDetail } from '../api/docs.types';
import type { PresenceUser } from '../webview/doc-editor-bridge.types';
import { PresenceAvatars } from './PresenceAvatars';

export interface EditorHeaderActionsProps {
  doc: DocumentDetail;
  onArchive: () => void;
  onHistory: () => void;
  onRename: () => void;
  onRestore: () => void;
  onSaveVersion: () => void;
  onShare: () => void;
  users: PresenceUser[];
}

/**
 * Hai khe phải của `AppBar` (bản vẽ chỉ có 2): người đang mở + menu "⋯". Hành động theo `myPermissions` do SERVER tính (`GET /documents/:id`):
 * đổi tên/lưu trữ/khôi phục cần `manage`; "Lưu phiên bản" cần `snapshot`. Tài liệu đã lưu trữ chỉ còn Chia sẻ (xem), Lịch sử và Khôi phục.
 */
export function EditorHeaderActions({
  doc,
  onArchive,
  onHistory,
  onRename,
  onRestore,
  onSaveVersion,
  onShare,
  users,
}: EditorHeaderActionsProps) {
  const { manage, snapshot } = doc.myPermissions;
  const active = doc.status === 'ACTIVE';

  const items: ActionMenuItem[] = [
    {
      hidden: !manage || !active,
      icon: 'edit',
      key: 'rename',
      label: 'Đổi tên',
      onPress: onRename,
    },
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
      label: 'Khôi phục tài liệu',
      onPress: onRestore,
    },
  ];

  return (
    <View className="flex-row items-center gap-2xs">
      <PresenceAvatars users={users} />
      <ActionMenu items={items} title={doc.title} />
    </View>
  );
}

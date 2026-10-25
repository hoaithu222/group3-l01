import { ActionMenuSheet, type ActionMenuItem } from '@/shared/ui/action-menu';
import { Dialog } from '@/shared/ui/modal';

import type { WhiteboardView } from '../api/whiteboard.types';
import type { useWhiteboardList } from '../hooks/useWhiteboardList';
import { canManageFromList } from '../utils/whiteboard-permissions';
import { RenameWhiteboardSheet } from './RenameWhiteboardSheet';

/**
 * Menu "⋯" của MỘT hàng bảng trắng + hai thứ nó mở ra (đổi tên, xác nhận lưu trữ). Tách khỏi màn danh sách để màn giữ dưới 200 dòng.
 *
 * Hành động cần quyền `manage` (đổi tên/lưu trữ/khôi phục) chỉ hiện khi `canManageFromList` — suy từ vai của hàng; hàng rào thật là BE (403 → toast).
 * "Chia sẻ" và "Lịch sử" luôn có: màn đích tự ẩn nút sửa theo `myPermissions` chính xác.
 */
export function WhiteboardMenuSheets({ list }: { list: ReturnType<typeof useWhiteboardList> }) {
  const board: WhiteboardView | null = list.menu.target;
  const manage = board ? canManageFromList(board, list.access?.myRole) : false;
  const archived = board?.status === 'ARCHIVED';

  const items: ActionMenuItem[] = board
    ? [
        {
          hidden: !manage || archived,
          icon: 'edit',
          key: 'rename',
          label: 'Đổi tên',
          onPress: () => list.rename.open(board),
        },
        {
          icon: 'user-add',
          key: 'share',
          label: 'Chia sẻ và cộng tác viên',
          onPress: () => list.openShare(board),
        },
        {
          icon: 'history',
          key: 'history',
          label: 'Lịch sử phiên bản',
          onPress: () => list.openHistory(board),
        },
        {
          description: 'Chuyển sang chỉ xem, khôi phục lại được',
          hidden: !manage || archived,
          icon: 'file-2',
          key: 'archive',
          label: 'Lưu trữ',
          onPress: () => list.archive.open(board),
        },
        {
          hidden: !manage || !archived,
          icon: 'reload',
          key: 'restore',
          label: 'Khôi phục bảng',
          onPress: () => list.restore(board),
        },
      ]
    : [];

  return (
    <>
      <ActionMenuSheet
        items={items}
        title={board?.name}
        visible={list.menu.visible}
        onClose={list.menu.close}
      />
      {list.rename.target ? (
        <RenameWhiteboardSheet
          board={list.rename.target}
          visible={list.rename.visible}
          onClose={list.rename.close}
        />
      ) : null}
      <Dialog
        description={`"${list.archive.target?.name ?? ''}" sẽ chuyển sang chế độ chỉ xem cho mọi người. Bạn có thể khôi phục trong tab Lưu trữ.`}
        primaryAction={{
          label: 'Lưu trữ',
          loading: list.archive.pending,
          onPress: list.archive.confirm,
        }}
        secondaryAction={{
          disabled: list.archive.pending,
          label: 'Huỷ',
          onPress: list.archive.close,
        }}
        title="Lưu trữ bảng trắng?"
        visible={list.archive.visible}
        onClose={list.archive.close}
      />
    </>
  );
}

import { ActionMenuSheet, type ActionMenuItem } from '@/shared/ui/action-menu';
import { Dialog } from '@/shared/ui/modal';

import type { DocumentView } from '../api/docs.types';
import type { useDocumentList } from '../hooks/useDocumentList';
import { canManageFromList } from '../utils/docs-permissions';
import { RenameDocumentSheet } from './RenameDocumentSheet';

/**
 * Menu "⋯" của MỘT hàng tài liệu + hai thứ nó mở ra (đổi tên, xác nhận lưu trữ). Tách khỏi màn danh sách để màn giữ dưới 200 dòng.
 *
 * Hành động cần quyền `manage` (đổi tên/lưu trữ/khôi phục) chỉ hiện khi `canManageFromList` — suy từ vai của hàng; hàng rào thật là BE (403 → toast).
 * "Chia sẻ" và "Lịch sử" luôn có: màn đích tự ẩn nút sửa theo `myPermissions` chính xác.
 */
export function DocumentMenuSheets({ list }: { list: ReturnType<typeof useDocumentList> }) {
  const doc: DocumentView | null = list.menu.target;
  const manage = doc ? canManageFromList(doc, list.access?.myRole) : false;
  const archived = doc?.status === 'ARCHIVED';

  const items: ActionMenuItem[] = doc
    ? [
        {
          hidden: !manage || archived,
          icon: 'edit',
          key: 'rename',
          label: 'Đổi tên',
          onPress: () => list.rename.open(doc),
        },
        {
          icon: 'user-add',
          key: 'share',
          label: 'Chia sẻ và cộng tác viên',
          onPress: () => list.openShare(doc),
        },
        {
          icon: 'history',
          key: 'history',
          label: 'Lịch sử phiên bản',
          onPress: () => list.openHistory(doc),
        },
        {
          description: 'Chuyển sang chỉ xem, khôi phục lại được',
          hidden: !manage || archived,
          icon: 'file-2',
          key: 'archive',
          label: 'Lưu trữ',
          onPress: () => list.archive.open(doc),
        },
        {
          hidden: !manage || !archived,
          icon: 'reload',
          key: 'restore',
          label: 'Khôi phục tài liệu',
          onPress: () => list.restore(doc),
        },
      ]
    : [];

  return (
    <>
      <ActionMenuSheet
        items={items}
        title={doc?.title}
        visible={list.menu.visible}
        onClose={list.menu.close}
      />
      {list.rename.target ? (
        <RenameDocumentSheet
          doc={list.rename.target}
          visible={list.rename.visible}
          onClose={list.rename.close}
        />
      ) : null}
      <Dialog
        description={`"${list.archive.target?.title ?? ''}" sẽ chuyển sang chế độ chỉ xem cho mọi người. Bạn có thể khôi phục trong tab Lưu trữ.`}
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
        title="Lưu trữ tài liệu?"
        visible={list.archive.visible}
        onClose={list.archive.close}
      />
    </>
  );
}

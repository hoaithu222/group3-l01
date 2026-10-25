import { ConfirmSheet } from '@/shared/ui/bottom-sheet';

import type { MemberListItem } from '../api/conversations.types';

export interface MemberConfirm {
  kind: 'remove' | 'transfer';
  member: MemberListItem;
}

export interface MemberConfirmSheetProps {
  /** `null` ⇒ đóng. */
  confirm: MemberConfirm | null;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (confirm: MemberConfirm) => void;
}

const COPY = {
  remove: {
    action: 'Xoá khỏi nhóm',
    description: (name: string) => `${name} sẽ không còn thấy tin nhắn mới của nhóm này nữa.`,
    icon: 'delete',
    title: (name: string) => `Xoá ${name} khỏi nhóm?`,
  },
  transfer: {
    action: 'Chuyển quyền',
    description: () =>
      'Người nhận trở thành chủ nhóm mới, bạn chuyển sang quản trị viên. Không tự hoàn tác được.',
    icon: 'shield-user',
    title: (name: string) => `Chuyển quyền chủ nhóm cho ${name}?`,
  },
} as const;

/**
 * Hỏi lại trước khi XOÁ thành viên hoặc CHUYỂN QUYỀN CHỦ NHÓM từ danh sách thành viên. Trước đây chạm hàng trong `MemberActionSheet`
 * là gọi API ngay — bấm nhầm "Chuyển quyền chủ nhóm" là mất quyền chủ nhóm không có đường lùi, trong khi cùng thao tác ở màn Thông
 * tin (rời nhóm) bắt gõ lại tên người nhận. Ở đây chỉ cần một bước xác nhận (người nhận đã được chọn rõ ràng ngay hàng vừa chạm).
 *
 * ✅ `ConfirmSheet` thay cho thân `{null}` + hai `Button fullWidth` trần trong `flex-row` (nút xác nhận bị đẩy ra mép tấm). Cả hai việc
 * đều không tự hoàn tác được ⇒ tông `danger`; ô biểu tượng nói "việc gì" trước khi đọc chữ: xoá → `delete`, chuyển quyền → `shield-user`.
 */
export function MemberConfirmSheet({
  confirm,
  loading,
  onClose,
  onConfirm,
}: MemberConfirmSheetProps) {
  const copy = confirm ? COPY[confirm.kind] : null;
  const name = confirm?.member.name ?? '';

  return (
    <ConfirmSheet
      confirmLabel={copy?.action ?? 'Xác nhận'}
      description={copy?.description(name)}
      icon={copy?.icon}
      loading={loading}
      title={copy?.title(name) ?? ''}
      tone="danger"
      visible={confirm !== null}
      onClose={onClose}
      onConfirm={() => {
        if (confirm) onConfirm(confirm);
      }}
    />
  );
}

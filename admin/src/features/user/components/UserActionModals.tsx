import { memo } from 'react';

import { ConfirmWithReasonModal } from '@/shared/ui';

import type { UserActionModalsState } from '../hooks';
import {
  useCancelAnonymizeUser,
  useLockUser,
  useRemoveUserAvatar,
  useUnlockUser,
} from '../service/user.queries';
import type { AdminUser } from '../types/user.types';
import AnonymizeUserModal from './AnonymizeUserModal';
import ChangeRoleModal from './ChangeRoleModal';

export interface UserActionModalsProps {
  user: AdminUser;
  /** Trạng thái mở/đóng của từng hộp thoại — từ `useUserActionModals()` ở drawer. */
  modals: UserActionModalsState;
  canAnonymizeNow: boolean;
}

/**
 * Các hộp thoại hành động của `UserDetailDrawer`: khoá · mở khoá · đổi vai trò · xoá · huỷ yêu cầu xoá ·
 * gỡ ảnh đại diện vi phạm.
 *
 * Cả hai route `POST /:id/lock` VÀ `POST /:id/unlock` phía BE đều bắt buộc `reason`
 * (`validateBody(reasonSchema)`) — dùng chung `ConfirmWithReasonModal` cho cả hai, KHÔNG chỉ khoá.
 * Lỗi 400/409 đã được hook toast đúng nghĩa (`utils/user-errors.ts`) và mutation reject nên
 * `ConfirmWithReasonModal` giữ modal mở.
 */
const UserActionModals = memo(function UserActionModals({
  user,
  modals,
  canAnonymizeNow,
}: UserActionModalsProps) {
  const lockUser = useLockUser();
  const unlockUser = useUnlockUser();
  const cancelAnonymize = useCancelAnonymizeUser();
  const removeAvatar = useRemoveUserAvatar(user.id);

  return (
    <>
      <ConfirmWithReasonModal
        confirmLabel="Khoá tài khoản"
        confirmTone="danger"
        impact="Người dùng sẽ bị đăng xuất khỏi mọi thiết bị và không thể đăng nhập lại tới khi được mở khoá."
        open={modals.lock.isOpen}
        title={`Khoá tài khoản — ${user.name}`}
        onConfirm={async (reason) => {
          await lockUser.mutateAsync({ id: user.id, reason });
        }}
        onOpenChange={(next) => !next && modals.lock.close()}
      />
      <ConfirmWithReasonModal
        confirmLabel="Mở khoá"
        impact="Người dùng có thể đăng nhập lại ngay sau khi mở khoá."
        open={modals.unlock.isOpen}
        title={`Mở khoá tài khoản — ${user.name}`}
        onConfirm={async (reason) => {
          await unlockUser.mutateAsync({ id: user.id, reason });
        }}
        onOpenChange={(next) => !next && modals.unlock.close()}
      />
      <ChangeRoleModal
        open={modals.role.isOpen}
        user={user}
        onOpenChange={(next) => !next && modals.role.close()}
      />
      <AnonymizeUserModal
        canAnonymizeNow={canAnonymizeNow}
        open={modals.remove.isOpen}
        user={user}
        onOpenChange={(next) => !next && modals.remove.close()}
      />
      <ConfirmWithReasonModal
        confirmLabel="Huỷ yêu cầu xoá"
        impact="Tài khoản trở lại trạng thái hoạt động bình thường, không còn bị xoá theo lịch."
        open={modals.cancelDeletion.isOpen}
        title={`Huỷ yêu cầu xoá — ${user.name}`}
        onConfirm={async (reason) => {
          await cancelAnonymize.mutateAsync({ id: user.id, reason });
        }}
        onOpenChange={(next) => !next && modals.cancelDeletion.close()}
      />
      <ConfirmWithReasonModal
        confirmLabel="Gỡ ảnh đại diện"
        confirmTone="danger"
        impact="Ảnh bị gỡ ngay, tài khoản hiện lại chữ cái đầu tên ở mọi nơi. Không hoàn tác được — người dùng phải tự tải ảnh mới."
        open={modals.removeAvatar.isOpen}
        title={`Gỡ ảnh đại diện — ${user.name}`}
        onConfirm={async (reason) => {
          await removeAvatar.mutateAsync(reason);
        }}
        onOpenChange={(next) => !next && modals.removeAvatar.close()}
      />
    </>
  );
});

export default UserActionModals;

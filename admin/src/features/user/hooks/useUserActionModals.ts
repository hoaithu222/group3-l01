import { useDisclosure } from '@/shared/hooks';

/**
 * Sáu hộp thoại hành động của drawer người dùng — mỗi cái một `useDisclosure` (`isOpen/open/close`).
 * Gom một chỗ để drawer (mở) và `UserActionModals` (vẽ) dùng chung MỘT trạng thái.
 */
export function useUserActionModals() {
  const lock = useDisclosure();
  const unlock = useDisclosure();
  const role = useDisclosure();
  const remove = useDisclosure();
  const cancelDeletion = useDisclosure();
  const removeAvatar = useDisclosure();
  return { lock, unlock, role, remove, cancelDeletion, removeAvatar };
}

export type UserActionModalsState = ReturnType<typeof useUserActionModals>;

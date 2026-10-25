import { router } from 'expo-router';

import { MemberActionRow } from './MemberActionRow';

export interface GuestManageRowProps {
  /** Đóng thẻ TRƯỚC khi điều hướng: `<Modal>` còn mở thì màn kế tiếp bị che một nhịp. */
  onClose: () => void;
  userId: string;
  wsId: string;
}

/**
 * Hàng "Quản lý quyền khách" trong thẻ thành viên → `members/[userId]/guest` (app.md p3-04
 * §1). Nơi gọi chỉ hiện khi thẻ là KHÁCH và `actions.canRemove` — cờ BE trả, đúng với
 * OWNER/ADMIN (khách là bậc thấp nhất nên ai loại được là quản lý được), nên không phải tự
 * suy vai trò của người xem ở client. Tách khỏi `MemberCardSheet` để file đó không vượt trần
 * 200 dòng.
 */
export function GuestManageRow({ onClose, userId, wsId }: GuestManageRowProps) {
  return (
    <MemberActionRow
      icon="shield-user"
      label="Quản lý quyền khách"
      onPress={() => {
        onClose();
        router.push({ pathname: '/workspaces/[wsId]/members/[userId]/guest', params: { userId, wsId } });
      }}
    />
  );
}

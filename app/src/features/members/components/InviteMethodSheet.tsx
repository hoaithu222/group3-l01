import { router } from 'expo-router';

import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import type { IconName } from '@/shared/ui/icon';

import { MemberActionRow } from './MemberActionRow';

type InviteRoute =
  | '/workspaces/[wsId]/invite'
  | '/workspaces/[wsId]/members/add'
  | '/workspaces/[wsId]/members/invite-email'
  | '/workspaces/[wsId]/members/invite-guest'
  | '/workspaces/[wsId]/members/invitations';

/** Một cách mời. `hidden` = người xem không được dùng — khai ĐỦ rồi lọc, để kẻ ngăn tính theo hàng THẬT sự hiện. */
interface InviteMethod {
  hidden: boolean;
  icon: IconName;
  label: string;
  pathname: InviteRoute;
}

export interface InviteMethodSheetProps {
  /** `myRole` OWNER/ADMIN — xem, gửi lại, thu hồi lời mời; mời khách; duyệt. */
  canManageMembers: boolean;
  /** `myPermissions.canInvite` — OWNER/ADMIN, hoặc MEMBER khi nhóm cho phép. */
  canInviteByEmail: boolean;
  onClose: () => void;
  visible: boolean;
  wsId: string;
}

/**
 * Chọn CÁCH mời (p3-04): link chung (p1-02) · email đích danh · thêm thẳng bằng SĐT/email · khách · xem lời mời
 * đã gửi. Hiện theo `canInvite`/`myRole` mà BE trả — chỉ để ẩn cho gọn; 403/404 của
 * BE mới là hàng rào thật.
 *
 * ⚠️ "Link mời" cũng CHỈ cho OWNER/ADMIN: BE `POST/GET /workspaces/:id/invites` đòi `requireWorkspaceRole("ADMIN")`, nên thành
 * viên thường (kể cả khi nhóm cho phép họ mời qua email) bấm vào chỉ nhận 403 rồi bị đá về. Trước đây dòng này "luôn có" — là
 * một nút chắc chắn lỗi với người không phải quản trị.
 *
 * Tấm MENU: `padded={false}` + `SheetList role="menu"` (lề 16, không khe giữa hàng) + hàng kẻ ngăn — cùng dáng `ActionMenuSheet`.
 */
export function InviteMethodSheet({
  canInviteByEmail,
  canManageMembers,
  onClose,
  visible,
  wsId,
}: InviteMethodSheetProps) {
  // Đóng sheet TRƯỚC khi điều hướng: `<Modal>` còn mở thì màn kế tiếp bị che một nhịp.
  function go(pathname: InviteRoute): void {
    onClose();
    router.push({ pathname, params: { wsId } });
  }

  const methods: InviteMethod[] = [
    {
      hidden: !canManageMembers,
      icon: 'link',
      label: 'Link mời',
      pathname: '/workspaces/[wsId]/invite',
    },
    {
      hidden: !canInviteByEmail,
      icon: 'email',
      label: 'Mời qua email',
      pathname: '/workspaces/[wsId]/members/invite-email',
    },
    // Thêm THẲNG (không cần người kia xác minh email hay bấm link) — cần OWNER/ADMIN, BE cũng kiểm lại.
    {
      hidden: !canManageMembers,
      icon: 'user-add',
      label: 'Thêm bằng SĐT / email',
      pathname: '/workspaces/[wsId]/members/add',
    },
    {
      hidden: !canManageMembers,
      icon: 'shield-user',
      label: 'Mời khách',
      pathname: '/workspaces/[wsId]/members/invite-guest',
    },
    {
      hidden: !canManageMembers,
      icon: 'history',
      label: 'Lời mời đã gửi',
      pathname: '/workspaces/[wsId]/members/invitations',
    },
  ];
  const shown = methods.filter((method) => !method.hidden);

  return (
    <BottomSheet padded={false} title="Mời vào nhóm" visible={visible} onClose={onClose}>
      <SheetList accessibilityRole="menu" className="pb-md">
        {shown.map((method, index) => (
          <MemberActionRow
            key={method.pathname}
            divider={index < shown.length - 1}
            icon={method.icon}
            label={method.label}
            onPress={() => go(method.pathname)}
          />
        ))}
      </SheetList>
    </BottomSheet>
  );
}

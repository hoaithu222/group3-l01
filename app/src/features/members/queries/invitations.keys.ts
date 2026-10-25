import type { InvitationStatus } from '../api';

/**
 * Khoá query lời mời email (app.md p3-04 §4).
 *
 * ⚠️ Khác app.md một chỗ CÓ CHỦ Ý: workspaceId ở VỊ TRÍ THỨ HAI
 * (`['invitations', wsId, 'list', status]`, app.md ghi `['invitations','list',wsId,…]`).
 * `matchesScope()` (`core/permission`) chỉ xoá cache theo workspace bị thu hồi khi
 * `queryKey[1] === scopeId` — đặt sai vị trí thì mất quyền vẫn còn danh sách lời
 * mời (có cả EMAIL đầy đủ) nằm trong bộ nhớ.
 */
export const invitationKeys = {
  all: ['invitations'] as const,
  /** Tiền tố — mọi trạng thái của một workspace. */
  listAll: (wsId: string) => ['invitations', wsId, 'list'] as const,
  list: (wsId: string, status: InvitationStatus) => ['invitations', wsId, 'list', status] as const,
  /** ⛔ Không persist, `gcTime: 0` (xem `useInvitationPreview`): token là bí mật. */
  byToken: (token: string) => ['invitations', 'token', token] as const,
  /** Lời mời gửi tới CHÍNH MÌNH (`GET /me/invitations`) — không theo workspace; `queryClient.clear()` khi đăng xuất lo dọn. */
  mine: () => ['invitations', 'mine'] as const,
};

/** `queryKey[1] === wsId` — cùng lý do ở trên. */
export const joinRequestKeys = {
  list: (wsId: string) => ['join-requests', wsId] as const,
};

/** Kênh chọn được cho khách — dưới tiền tố `members` để `matchesScope` dọn theo workspace. */
export const guestKeys = {
  channelOptions: (wsId: string) => ['members', wsId, 'guest-channel-options'] as const,
};

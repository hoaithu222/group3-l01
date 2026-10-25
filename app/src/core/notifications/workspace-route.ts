import type { Href } from 'expo-router';

import type { NotificationTarget } from './notification-target.types';

/**
 * Thông báo cấp NHÓM LÀM VIỆC → đích (tách khỏi `notification-route.ts` để file đó giữ trong trần độ dài, cùng vai `contribution-route.ts`).
 * Trước đây các loại này rơi về `null` ⇒ chạm một mục hộp thư chỉ ra toast "Không mở được thông báo này".
 *
 *  · `workspace.invited` → "Lời mời của tôi" (người nhận chưa là thành viên nên chưa có màn nhóm để mở).
 *  · `workspace.join-requested` → hàng chờ duyệt của nhóm.
 *  · `workspace.join-rejected` → danh sách nhóm (không còn nhóm nào để mở).
 *  · `workspace.member-added|join-approved|invite-accepted|admin-change`, `guest.expiring` → TỔNG QUAN nhóm. ⚠️ `admin-change` với
 *    `action=removed|banned` thì nhóm đã đóng với người nhận — `[wsId]/_layout` tự đá về danh sách nhóm (`redirectWhenGone`), nên không
 *    cần phân nhánh theo `action` ở đây.
 *  · `integration.error` → màn tích hợp của nhóm; `wallet.*` → ví nhóm.
 * Thiếu `workspaceId` → `null` (rơi về hộp thư). ⛔ Không kiểm quyền ở đây: màn đích tự hiện "không còn khả dụng" khi BE trả 403/404.
 *
 * ⚠️ `integrations`/`wallet` ép kiểu `as Href` vì route CHỈ-CÓ-`index` bị bộ sinh typed routes sinh thất thường (cùng bẫy `wallet-routes.ts`);
 * đổi đường dẫn thì sửa CẢ `features/wallet/utils/wallet-routes.ts`.
 */
export function isWorkspaceEventType(type: string): boolean {
  return (
    type.startsWith('workspace.') ||
    type === 'guest.expiring' ||
    type === 'integration.error' ||
    type.startsWith('wallet.')
  );
}

export function workspaceEventHref({ type, workspaceId }: NotificationTarget): Href | null {
  if (type === 'workspace.invited') return '/workspaces/invitations';
  if (type === 'workspace.join-rejected') return '/workspaces';
  if (!workspaceId) return null;
  if (type === 'workspace.join-requested') {
    return { params: { wsId: workspaceId }, pathname: '/workspaces/[wsId]/members/requests' };
  }
  if (type === 'integration.error') return `/workspaces/${workspaceId}/integrations` as Href;
  if (type.startsWith('wallet.')) return `/workspaces/${workspaceId}/wallet` as Href;
  return { params: { wsId: workspaceId }, pathname: '/workspaces/[wsId]' };
}

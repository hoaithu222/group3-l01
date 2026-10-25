import type { InboxItem } from '@/core/notifications';

import {
  actorName,
  refText,
  workspaceLabel,
  type ActivityDescription,
  type DescribeOptions,
} from './describe-helpers';
import { isInboxItemUnavailable } from './inbox-target';

/** Vai trò trong nhóm (`WorkspaceRole` của BE) → nhãn tiếng Việt. */
const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Quản trị viên',
  GUEST: 'Khách',
  MEMBER: 'Thành viên',
  OWNER: 'Chủ nhóm',
};

/**
 * Câu cho `workspace.admin-change` theo `refs.action` (BE: `membership-lifecycle.service.ts`, `workspace-lifecycle.service.ts`,
 * `admin-workspace-image.service.ts`): `role-changed` (kèm `refs.role`), tên trạng thái thành viên viết thường (`MembershipStatus`:
 * active · pending · left · removed · banned — thực tế BE chỉ gửi `removed`/`banned`), `archived` (quản trị nền tảng lưu trữ nhóm),
 * và `avatar-removed` / `cover-removed` (quản trị hệ thống gỡ ảnh đại diện / ảnh bìa VI PHẠM của nhóm — người nhận là CHỦ nhóm, nên
 * câu nói về nhóm chứ không về "tư cách thành viên"). Action lạ → câu trung tính nhưng vẫn nói ĐÂY LÀ chuyện của nhóm (không rơi về
 * "Bạn có thông báo mới").
 */
function adminChange(item: InboxItem, ws: string | undefined): string {
  const inGroup = ws ? `nhóm ${ws}` : 'một nhóm làm việc';
  const action = refText(item, 'action')?.toLowerCase();
  switch (action) {
    case 'role-changed': {
      const role = ROLE_LABEL[refText(item, 'role')?.toUpperCase() ?? ''];
      return role
        ? `Vai trò của bạn trong ${inGroup} đã đổi thành ${role}`
        : `Vai trò của bạn trong ${inGroup} đã thay đổi`;
    }
    case 'removed':
      return `Bạn đã bị xoá khỏi ${inGroup}`;
    case 'banned':
      return `Bạn đã bị chặn khỏi ${inGroup}`;
    case 'left':
      return `Bạn đã rời ${inGroup}`;
    case 'pending':
      return `Tư cách thành viên của bạn trong ${inGroup} đang chờ duyệt`;
    case 'active':
      return `Bạn đã là thành viên của ${inGroup}`;
    case 'archived':
      return `${ws ? `Nhóm ${ws}` : 'Một nhóm của bạn'} đã được quản trị hệ thống lưu trữ`;
    case 'avatar-removed':
      return `Ảnh đại diện của ${inGroup} đã bị quản trị hệ thống gỡ`;
    case 'cover-removed':
      return `Ảnh bìa của ${inGroup} đã bị quản trị hệ thống gỡ`;
    default:
      return `Tư cách thành viên của bạn trong ${inGroup} có thay đổi`;
  }
}

/**
 * Câu cho nhóm loại `workspace.*` + `guest.expiring`. `null` = không phải loại của nhóm này (nơi gọi thử nhóm khác).
 * BE không điền `actor` cho các mục này (chúng không thuộc tin nhắn) nên mọi câu có "người thực hiện" đều có bản không người.
 */
export function describeWorkspace(
  item: InboxItem,
  options?: DescribeOptions,
): ActivityDescription | null {
  const ws = workspaceLabel(item, options);
  const who = actorName(item);
  const group = ws ? `nhóm ${ws}` : 'một nhóm làm việc';

  switch (item.type) {
    case 'workspace.member-added':
      return { title: who ? `${who} đã thêm bạn vào ${group}` : `Bạn được thêm vào ${group}` };
    case 'workspace.invited':
      return { title: who ? `${who} mời bạn tham gia ${group}` : `Bạn được mời tham gia ${group}` };
    case 'workspace.join-requested':
      return { title: `Có yêu cầu tham gia ${group} đang chờ bạn duyệt` };
    case 'workspace.join-approved':
      return { title: `Yêu cầu tham gia ${group} đã được duyệt` };
    case 'workspace.join-rejected':
      return { title: `Yêu cầu tham gia ${group} đã bị từ chối` };
    case 'workspace.invite-accepted':
      return { title: `${who ?? 'Có người'} đã tham gia ${group}` };
    case 'guest.expiring':
      return { title: `Quyền khách của bạn trong ${group} sắp hết hạn` };
    case 'workspace.admin-change':
      return { title: adminChange(item, ws) };
    default:
      return null;
  }
}

/**
 * Mục thuộc nhóm `workspace.*` mà BE không kèm TÊN nhóm (`admin-change` chỉ có id) ⇒ cần tra tên theo id ở danh sách nhóm của tôi.
 * Mục mất quyền không tra (không được lộ tên nhóm cũ).
 */
export function needsWorkspaceLookup(item: InboxItem): boolean {
  if (isInboxItemUnavailable(item)) return false;
  if (!item.type.startsWith('workspace.') && item.type !== 'guest.expiring') return false;
  return !workspaceLabel(item) && Boolean(item.workspaceId ?? refText(item, 'workspaceId'));
}

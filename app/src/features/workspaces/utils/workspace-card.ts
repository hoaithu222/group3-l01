import { formatRelative } from '@/shared/utils/format/date.utils';
import { formatGuestRemaining, getGuestRemaining } from '@/shared/utils/format/guest-expiry.utils';

import type { WorkspaceListItem } from '../api';

/** Kiểu báo "có tin mới" của một thẻ: nhắc tên (đỏ, ưu tiên) · kênh chưa đọc (màu thương hiệu) · không có gì. */
export type WorkspaceUnreadTone = 'mention' | 'unread' | null;

export interface WorkspaceCardFacts {
  isArchived: boolean;
  /** p3-04: mới chỉ là YÊU CẦU chờ duyệt — chưa đọc được nhóm. */
  isPending: boolean;
  /** "Chủ nhóm" / "Quản trị viên". Thành viên thường KHÔNG có nhãn: là mặc định, thêm vào từng thẻ chỉ là nhiễu. */
  roleText: string | null;
  /** "Khách · còn 5 ngày" — chỉ "Khách" khi BE chưa gửi hạn (⛔ không bịa ngày). */
  guestText: string | null;
  /** Hạn khách sắp hết (≤ 48 giờ) ⇒ tông cảnh báo + icon. */
  guestUrgent: boolean;
  /** "Hoạt động 3 phút trước" — `null` khi BE không có mốc hoặc đang chờ duyệt (chưa phải thành viên). */
  activityText: string | null;
  /** Chưa đọc bằng CHỮ — màu của huy hiệu chỉ là phụ, ⛔ không bao giờ là dấu hiệu duy nhất. */
  unreadText: string | null;
  unreadTone: WorkspaceUnreadTone;
  /** Nhãn trợ năng của cả thẻ (thẻ là MỘT ô bấm — trình đọc màn hình không vào được từng mẩu bên trong). */
  a11yLabel: string;
}

function roleTextOf(role: WorkspaceListItem['myRole']): string | null {
  if (role === 'OWNER') return 'Chủ nhóm';
  if (role === 'ADMIN') return 'Quản trị viên';
  return null;
}

/**
 * Gom MỌI chữ của `WorkspaceCard` vào một chỗ (thẻ chỉ còn việc vẽ) — test được không cần dựng component.
 *
 * ⚠️ Thứ tự nhãn trợ năng giữ nguyên bản cũ (tên → lưu trữ → chờ duyệt → khách → vai trò), phần mới (yêu thích, chưa đọc,
 * hoạt động) nối SAU và chỉ khi có dữ liệu — người dùng trình đọc màn hình nghe điều phân biệt các nhóm trước tiên.
 * ⚠️ `unreadCount` là số KÊNH có tin chưa đọc (BE `read-state` map `unreadChannels`, `withWorkspaceUnread` cũng vậy) —
 * không phải số tin, nên chữ là "kênh có tin mới".
 */
export function workspaceCardFacts(
  workspace: WorkspaceListItem,
  now = Date.now(),
): WorkspaceCardFacts {
  const isArchived = workspace.status === 'ARCHIVED';
  const isPending = workspace.status === 'PENDING';
  const isGuest = workspace.myRole === 'GUEST';
  const remaining = isGuest ? getGuestRemaining(workspace.myExpiresAt, now) : null;
  const guestText = remaining
    ? `Khách · ${formatGuestRemaining(remaining)}`
    : isGuest
      ? 'Khách'
      : null;
  const roleText = roleTextOf(workspace.myRole);

  const unreadTone: WorkspaceUnreadTone =
    workspace.mentionCount > 0 ? 'mention' : workspace.unreadCount > 0 ? 'unread' : null;
  const unreadText =
    unreadTone === 'mention'
      ? `${workspace.mentionCount} lượt nhắc tên`
      : unreadTone === 'unread'
        ? `${workspace.unreadCount} kênh có tin mới`
        : null;
  const relative = isPending ? '' : formatRelative(workspace.lastActivityAt);
  const activityText = relative ? `Hoạt động ${relative}` : null;

  const a11yLabel = [
    workspace.name,
    isArchived ? 'đã lưu trữ' : null,
    isPending ? 'đang chờ duyệt' : null,
    guestText,
    roleText,
    workspace.isFavorite ? 'đã yêu thích' : null,
    unreadText,
    activityText,
  ]
    .filter(Boolean)
    .join(', ');

  return {
    a11yLabel,
    activityText,
    guestText,
    guestUrgent: remaining?.urgent ?? false,
    isArchived,
    isPending,
    roleText,
    unreadText,
    unreadTone,
  };
}

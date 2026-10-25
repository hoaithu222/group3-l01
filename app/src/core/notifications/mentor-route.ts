import type { Href } from 'expo-router';

import type { NotificationTarget } from './notification-target.types';

/**
 * Mentor Connect (p6-03): thông báo `mentor.*` của BE (`be/src/modules/mentor/services/mentor-notifications.ts`) → đích. Tách khỏi
 * `notification-route.ts` để file đó giữ trong trần độ dài (cùng vai `study-route.ts`/`review-route.ts`).
 *
 * Push/hộp thư chỉ mang id (`workspaceId`, `postId`, `applicationId`, `engagementId`, `conversationId`) — KHÔNG nội dung; màn đích tự tải lại và
 * nói "không còn khả dụng" khi BE trả 403/404. ⛔ Không kiểm quyền ở đây.
 *
 *  · `mentor.application` (OWNER/ADMIN: có đơn mới) → màn DUYỆT ĐƠN của bài; thiếu `postId` → quản lý bài của nhóm.
 *  · `mentor.accepted` → nhóm chat cố vấn khi có (`conversationId`); không thì tổng quan nhóm (cố vấn vừa thành khách của nhóm; người đăng bài
 *    thì thấy đợt mới ở đó). BE gửi cùng loại này cho CẢ cố vấn lẫn người đăng bài, cùng `refs`.
 *  · `mentor.rejected` (người ứng tuyển) → tab "Đơn của tôi" của bảng tin.
 *  · `mentor.ending-soon` / `mentor.ended` — BE gửi CẢ cho cố vấn (`scope: null`) lẫn nhóm (`scope: WORKSPACE`, người đăng bài): người
 *    thuộc nhóm (`scopeType = WORKSPACE`) → quản lý của nhóm (gia hạn/kết thúc ở đó); cố vấn → tab "Đang cố vấn". Cố vấn không còn là thành
 *    viên sau `mentor.ended` nên KHÔNG mở tổng quan nhóm (sẽ bị đá ra).
 *  · `mentor.post-hidden` (quản trị nền tảng ẩn bài của nhóm) → quản lý bài của nhóm.
 *  · Loại `mentor.*` lạ → bảng tin.
 *
 * ⚠️ Ép `as Href` vì các route CHỈ-CÓ-`index` (`mentor/index.tsx`, `workspaces/[wsId]/mentor/index.tsx`) bị bộ sinh typed routes sinh thất
 * thường `/x` hoặc `/x/index` (cùng bẫy `wallet-routes.ts`), và route mới chưa chắc có trong `.expo/types/router.d.ts`. Đổi đường dẫn thì sửa CẢ
 * `features/mentor/utils/mentor-routes.ts`.
 *
 * ⛔ Mỗi nhánh là một hàm trả `Href` với `if`/`return` tường minh — KHÔNG viết `cond ? a as Href : b as Href` trong một biểu thức: `Href` đã vài
 * trăm mục, TS rút gọn union quá giới hạn (TS2590), cùng bẫy đã ghi ở `hrefForTarget`.
 */
export function isMentorType(type: string): boolean {
  return type.startsWith('mentor.');
}

const BOARD = '/mentor' as Href;
const BOARD_APPLICATIONS = '/mentor?tab=applications' as Href;
const BOARD_ENGAGED = '/mentor?tab=engaged' as Href;

/** Thông báo gửi cho phía NHÓM (người đăng bài/quản trị) mang phạm vi WORKSPACE; phía cố vấn/người ứng tuyển không có phạm vi. */
function isTeamSide({ scopeType }: NotificationTarget): boolean {
  return scopeType === 'WORKSPACE';
}

function workspaceMentorHref(workspaceId: string): Href {
  return `/workspaces/${workspaceId}/mentor` as Href;
}

function applicationsHref(workspaceId: string, postId: string | undefined): Href {
  if (!postId) return workspaceMentorHref(workspaceId);
  return `/workspaces/${workspaceId}/mentor/${postId}/applications` as Href;
}

function acceptedHref({ conversationId, workspaceId }: NotificationTarget): Href {
  if (conversationId) return `/messages/${conversationId}` as Href;
  if (workspaceId) return `/workspaces/${workspaceId}` as Href;
  return BOARD_ENGAGED;
}

function engagementHref(target: NotificationTarget): Href {
  if (isTeamSide(target) && target.workspaceId) return workspaceMentorHref(target.workspaceId);
  return BOARD_ENGAGED;
}

export function mentorHref(target: NotificationTarget): Href | null {
  const { postId, type, workspaceId } = target;

  switch (type) {
    case 'mentor.application':
      if (!workspaceId) return null;
      return applicationsHref(workspaceId, postId);
    case 'mentor.accepted':
      return acceptedHref(target);
    case 'mentor.rejected':
      return BOARD_APPLICATIONS;
    case 'mentor.ending-soon':
    case 'mentor.ended':
      return engagementHref(target);
    case 'mentor.post-hidden':
      if (!workspaceId) return null;
      return workspaceMentorHref(workspaceId);
    default:
      return BOARD;
  }
}

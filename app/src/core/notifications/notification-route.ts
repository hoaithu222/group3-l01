import type { Href } from 'expo-router';

import { PATHS } from '@/shell/config';

import { chatExtHref, isChatExtType } from './chat-ext-route';
import { contributionExportHref, isContributionExportType } from './contribution-route';
import { documentHref, isDocumentType } from './document-route';
import { isJobOfferType, jobOfferHref } from './job-offer-route';
import { meetingHref } from './meeting-recap-route';
import { isMentorType, mentorHref } from './mentor-route';
import type { NotificationTarget } from './notification-target.types';
import { isO2oType, o2oHref } from './o2o-route';
import { isReviewType, reviewHref } from './review-route';
import { isRoadmapType, roadmapHref } from './roadmap-route';
import { isStudyType, studyHref } from './study-route';
import { isWorkspaceEventType, workspaceEventHref } from './workspace-route';

/**
 * BẢNG `type → route` của thông báo (p1-07 `be.md` §15.3: "app SỞ HỮU bảng này, BE chỉ bảo đảm đủ id").
 *
 * MỘT nơi dùng chung cho hai đường vào: chạm PUSH (`push-router.ts`) và chạm một mục hộp thư Hoạt động
 * (`features/activity`). Cùng bộ id nhưng hai hình dạng (`data` của FCM là map chuỗi; `InboxItem` có `refs`) — cả hai
 * quy về `NotificationTarget` rồi qua `hrefForTarget`, nên đổi/thêm một loại chỉ sửa MỘT chỗ.
 */
export type { NotificationTarget } from './notification-target.types';

// p5-04: `announcement.*` mở đúng tin cần xác nhận (`?m=`) — push/hộp thư mang `scopeType=CHANNEL` + `scopeId` + `workspaceId` như tin thường.
const MESSAGE_TYPES = new Set([
  'message.new',
  'mention',
  'mention.role',
  'thread.reply',
  'announcement.required',
  'announcement.reminder',
]);

/** Mở đúng tin (`?m=`) chỉ khi đó là MỘT tin cụ thể: `message.new` không có tin đích, và tin gộp thì không. */
function jumpTarget(target: NotificationTarget): string | undefined {
  if (target.coalesced || target.type === 'message.new') return undefined;
  return target.messageId;
}

function messageHref(target: NotificationTarget): Href | null {
  const { rootMessageId, scopeId, scopeType, workspaceId } = target;
  const m = jumpTarget(target);

  if (scopeType === 'CONVERSATION' && scopeId) {
    return {
      params: m ? { conversationId: scopeId, m } : { conversationId: scopeId },
      pathname: '/messages/[conversationId]',
    };
  }
  if (scopeType === 'CHANNEL' && scopeId && workspaceId) {
    // Tin nằm TRONG luồng (reply, hoặc nhắc tên trong luồng) → màn luồng, `m` là reply cần mở.
    // Tin gộp không có `m` nhưng vẫn vào luồng nếu biết gốc — người dùng muốn thấy các reply mới.
    if (rootMessageId && (target.type === 'thread.reply' || m)) {
      return {
        params: m
          ? { chId: scopeId, m, messageId: rootMessageId, wsId: workspaceId }
          : { chId: scopeId, messageId: rootMessageId, wsId: workspaceId },
        pathname: '/workspaces/[wsId]/channels/[chId]/thread/[messageId]',
      };
    }
    return {
      params: m ? { chId: scopeId, m, wsId: workspaceId } : { chId: scopeId, wsId: workspaceId },
      pathname: '/workspaces/[wsId]/channels/[chId]',
    };
  }
  return null;
}

function taskHref(target: NotificationTarget): Href | null {
  const { boardId, taskId, workspaceId } = target;
  if (!workspaceId || !taskId) return null;
  // Có `boardId` → thẳng chi tiết thẻ; thiếu thì dùng route giải `boardId` (deep link `/w/{ws}/t/{task}`).
  if (boardId) {
    return {
      params: { boardId, taskId, wsId: workspaceId },
      pathname: '/workspaces/[wsId]/boards/[boardId]/tasks/[taskId]',
    };
  }
  return { params: { taskId, wsId: workspaceId }, pathname: '/workspaces/[wsId]/tasks/[taskId]' };
}

/**
 * p4-04: `task.reschedule-batch-done` (lô dời lịch nền xong) mở BẢNG chứa lô — không có thẻ đích duy nhất, chỉ có
 * `boardId` (be.md p4-04 §7). Thiếu `boardId`/`workspaceId` → `null` (rơi về hộp thư). `task.rescheduled` thì đi
 * đường thẻ thông thường: `taskId` = thẻ NGUỒN đã đổi hạn, chi tiết thẻ liệt kê hoạt động "do thẻ A đổi hạn".
 */
function rescheduleBoardHref({ boardId, workspaceId }: NotificationTarget): Href | null {
  if (!boardId || !workspaceId) return null;
  return {
    params: { boardId, wsId: workspaceId },
    pathname: '/workspaces/[wsId]/boards/[boardId]',
  };
}

/** Hàng đợi báo cáo cho người xử lý phạm vi (p1-08): nhóm chat hoặc nhóm làm việc. */
function reportsHref({ scopeId, scopeType, workspaceId }: NotificationTarget): Href | null {
  if (scopeType === 'CONVERSATION' && scopeId) {
    return { params: { conversationId: scopeId }, pathname: '/messages/[conversationId]/reports' };
  }
  if (workspaceId) return { params: { wsId: workspaceId }, pathname: '/workspaces/[wsId]/reports' };
  return null;
}

/**
 * Đích của một thông báo. Trả `null` khi không dựng được route (thiếu id) — nơi gọi tự chọn: push → `/activity`,
 * hộp thư → toast trung tính. ⛔ Không kiểm quyền ở đây: màn đích tự gọi API và hiện "không còn khả dụng" khi
 * BE trả 403/404 (push chỉ mang id, không mang nội dung — luôn fetch lại lúc mở).
 */
export function hrefForTarget(target: NotificationTarget): Href | null {
  const { type } = target;

  if (MESSAGE_TYPES.has(type)) return messageHref(target);
  // p4-05 (đặt TRƯỚC `task.*`): `review.requested|reminder` → màn chấm, `review.shortage` → cài đặt chấm chéo; còn lại → chi tiết thẻ.
  if (isReviewType(type)) {
    // ⛔ `if` chứ không `??`: `Href` đã vài trăm mục, biểu thức `a ?? b` làm TS rút gọn union quá giới hạn (TS2590).
    const review = reviewHref(target);
    if (review) return review;
    return taskHref(target);
  }
  if (type.startsWith('task.reschedule-')) return rescheduleBoardHref(target);
  if (type.startsWith('task.')) return taskHref(target);
  if (type === 'moderation.request') return reportsHref(target);
  if (isContributionExportType(type)) return contributionExportHref(target); // p4-06: báo cáo đóng góp xuất xong/lỗi
  if (isStudyType(type)) return studyHref(target); // Học (p4-02): nhắc ôn hằng ngày · bài thi tự nộp
  if (isRoadmapType(type)) return roadmapHref(target); // Lộ trình học (p4-07 bước 12): nhắc học hằng ngày → buổi đến hạn
  // Lịch sử cuộc gọi đã có (`messages/calls`); `call.incoming` là data-only nhưng vẫn về đây nếu bị chạm.
  if (type.startsWith('call.')) return '/messages/calls';
  if (type.startsWith('meeting.')) return meetingHref(target); // gồm biên bản/ghi hình + nhắc biên bản (`meeting.reminder` + `kind = RECAP`)
  // Gamification (p4-03): lên cấp / huy hiệu mới → màn Thành tích (không cần id — màn tự tải hồ sơ của mình).
  if (type === 'gamification.level-up' || type === 'gamification.badge-unlocked')
    return '/me/achievements';
  if (type.startsWith('career.skill-')) return '/me/career' as Href; // p6-06: huy hiệu kỹ năng mới/thu hồi → Nghề nghiệp
  if (type.startsWith('portfolio.')) return '/me/career/portfolio' as Href; // p6-07: dựng trang lỗi (`build-failed`) / bị gỡ (`taken-down`) → tổng quan Portfolio (không cần id)
  if (type === 'auth.new-device') return '/me/sessions' as Href; // đăng nhập thiết bị lạ → màn Phiên đăng nhập để thu hồi máy lạ (không cần id)
  if (type === 'wellbeing.alert') return '/me/wellbeing' as Href; // p7-03: nhắc nghỉ ngơi (push trung tính) → màn Sức khoẻ, nơi thẻ cảnh báo chờ đang hiện (không cần id)
  if (isWorkspaceEventType(type)) return workspaceEventHref(target); // lời mời/duyệt/thêm/đổi vai trò/khách hết hạn, tích hợp lỗi, ví
  if (isDocumentType(type)) return documentHref(target); // p6-01: được mời cùng soạn tài liệu → mở thẳng tài liệu
  if (isMentorType(type)) return mentorHref(target); // p6-03: đơn ứng tuyển/được nhận/đợt cố vấn
  if (isO2oType(type)) return o2oHref(target); // p6-05: đơn in được nhận/từ chối/sẵn sàng/nhận xong/huỷ/hết hạn → vé đơn
  if (isJobOfferType(type)) return jobOfferHref(target); // p6-08: lời mời mới → chi tiết, tin mới → trao đổi
  if (isChatExtType(type)) return chatExtHref(target); // p7-04: tin hẹn giờ không gửi được → "Tin đã hẹn" (tab Lỗi) · nhắc lại tin → tin/"Nhắc lại của tôi"
  return null; // Loại lạ: chưa có màn đích riêng → hộp thư, nơi mục hiện đủ ngữ cảnh.
}

/** Như `hrefForTarget` nhưng luôn có đích: rơi về hộp thư Hoạt động. */
export function hrefOrActivity(target: NotificationTarget): Href {
  const href = hrefForTarget(target);
  if (href) return href; // `if` chứ không `??` — xem chú thích ở `hrefForTarget` (TS2590).
  return PATHS.ACTIVITY;
}

import type { InboxItem } from '@/core/notifications';

import { activityIconFor } from '../utils/activity-icon';
import { describeActivity } from '../utils/describe-item';

/**
 * Rà mọi `type` BE phát vào hộp thư (`registerNotificationType` với `inbox: true` ở `be/src/modules/**`): không loại nào được rơi về câu
 * chung "Bạn có thông báo mới" hay biểu tượng chuông mặc định. Danh sách là BẢN SAO CỐ Ý — thêm loại mới ở BE thì thêm vào đây cùng
 * lúc với câu ở `utils/describe-*.ts` và tiền tố ở `utils/activity-icon.ts`.
 */
const INBOX_TYPES = [
  // tin nhắn / kênh / cuộc gọi
  'mention',
  'mention.role',
  'thread.reply',
  'message.new',
  'channel.private-added',
  'channel.archived-notice',
  'conversation.added',
  'call.missed',
  // họp
  'meeting.invited',
  'meeting.reminder',
  'meeting.started',
  'meeting.updated',
  'meeting.cancelled',
  'meeting.recap-published',
  'meeting.recap-reminder',
  'meeting.recap-required',
  'meeting.recording-ready',
  'meeting.removed',
  'meeting.role-changed',
  // nhóm làm việc
  'workspace.invited',
  'workspace.join-requested',
  'workspace.join-approved',
  'workspace.join-rejected',
  'workspace.member-added',
  'workspace.invite-accepted',
  'workspace.admin-change',
  'guest.expiring',
  // thẻ / chấm chéo / đóng góp
  'task.assigned',
  'task.comment',
  'task.comment-mention',
  'task.due-soon',
  'task.rescheduled',
  'task.reschedule-batch-done',
  'review.requested',
  'review.reminder',
  'review.cancelled',
  'review.changes-requested',
  'review.approved',
  'review.waived',
  'review.shortage',
  'contribution.export-ready',
  'contribution.export-failed',
  // kiểm duyệt / thông báo kênh / tích hợp
  'moderation.request',
  'moderation.report-resolved',
  'moderation.content-removed',
  'moderation.warning',
  'moderation.private-viewed',
  'announcement.required',
  'announcement.reminder',
  'integration.error',
  // thành tích / học / nghề nghiệp
  'gamification.level-up',
  'gamification.badge-unlocked',
  'career.skill-unlocked',
  'career.skill-revoked',
  'portfolio.build-failed',
  'portfolio.taken-down',
  'study.sr-due-reminder',
  'study.mock-auto-submitted',
  // ví / cố vấn / đơn in
  'wallet.expense-added',
  'wallet.settlement-pending',
  'wallet.settlement-confirmed',
  'wallet.settlement-rejected',
  'wallet.settlement-stale',
  'wallet.debt-reminder',
  'wallet.export-ready',
  'mentor.application',
  'mentor.accepted',
  'mentor.rejected',
  'mentor.ending-soon',
  'mentor.ended',
  'mentor.post-hidden',
  'print-order.new',
  'print-order.accepted',
  'print-order.rejected',
  'print-order.ready',
  'print-order.picked-up',
  'print-order.cancelled',
  'print-order.expiring',
  'print-order.expired',
  // tuyển dụng (p6-08): lời mời việc làm + doanh nghiệp
  'job-offer.received',
  'job-offer.message',
  'job-offer.responded',
  'company.status-changed',
  'company.needs-review',
];

function make(type: string, refs: Record<string, unknown> = {}): InboxItem {
  return {
    actor: null,
    actorId: null,
    context: { available: true, muted: false },
    createdAt: '2026-09-26T08:00:00.000Z',
    id: 'n1',
    kind: 'DEFAULT',
    muted: false,
    readAt: null,
    refs: { workspaceId: 'ws-1', ...refs },
    scopeId: null,
    scopeType: 'NONE',
    type,
    unavailable: false,
    workspaceId: 'ws-1',
  };
}

describe('phủ hết các loại BE phát vào hộp thư', () => {
  it.each(INBOX_TYPES)('%s có câu riêng và biểu tượng riêng', (type) => {
    expect(describeActivity(make(type)).title).not.toBe('Bạn có thông báo mới');
    expect(activityIconFor(type)).not.toBe('notification');
  });

  it('câu dùng số liệu công khai trong refs khi có', () => {
    const title = (type: string, refs: Record<string, unknown>) =>
      describeActivity(make(type, refs)).title;
    expect(title('gamification.level-up', { level: 7 })).toBe('Bạn đã lên cấp 7');
    expect(title('gamification.badge-unlocked', { name: 'Chăm chỉ' })).toBe(
      'Bạn vừa nhận huy hiệu Chăm chỉ',
    );
    expect(title('study.sr-due-reminder', { dueCount: 12 })).toBe('Bạn có 12 thẻ cần ôn hôm nay');
    expect(title('meeting.invited', { scopeTitle: 'Họp nhóm' })).toBe(
      'Bạn được mời tham dự một cuộc họp: Họp nhóm',
    );
    expect(title('print-order.ready', { code: 'A12' })).toBe(
      'Tài liệu đã in xong — mang mã PIN tới tiệm (A12)',
    );
  });

  it('loại thật sự lạ vẫn có câu trung tính, không ném', () => {
    expect(describeActivity(make('gi.do.moi')).title).toBe('Bạn có thông báo mới');
  });
});

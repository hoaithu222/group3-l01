import { hrefForTarget } from '@/core/notifications';
import type { InboxItem } from '@/core/notifications';

import { describeActivity } from '../utils/describe-item';
import { inboxItemTarget } from '../utils/inbox-target';

/**
 * p6-08: `job-offer.*` mang `refs.offerId` (+ `companyName`) — chạm mục hộp thư mở đúng chi tiết/thread; câu mô tả dùng TÊN doanh nghiệp (công khai) chứ không tiêu đề/nội dung
 * lời mời (CR-47). Cùng đường `hrefForTarget` với push nên hai đường vào không lệch nhau.
 */
function make(type: string, refs: Record<string, unknown>): InboxItem {
  return {
    actor: null,
    actorId: null,
    context: { available: true, muted: false },
    createdAt: '2026-09-27T08:00:00.000Z',
    id: 'n1',
    kind: 'DEFAULT',
    muted: false,
    readAt: null,
    refs,
    scopeId: null,
    scopeType: 'NONE',
    type,
    unavailable: false,
    workspaceId: null,
  } as unknown as InboxItem;
}

describe('hộp thư Hoạt động — lời mời việc làm', () => {
  it('refs.offerId đi vào target ⇒ received mở chi tiết, message mở thread', () => {
    const received = make('job-offer.received', { companyName: 'Công ty Alpha', offerId: 'o1' });
    expect(inboxItemTarget(received).offerId).toBe('o1');
    expect(hrefForTarget(inboxItemTarget(received))).toBe('/me/career/offers/o1');
    expect(hrefForTarget(inboxItemTarget(make('job-offer.message', { offerId: 'o1' })))).toBe(
      '/me/career/offers/o1/thread',
    );
  });

  it('câu mô tả: có tên doanh nghiệp thì nêu tên; không có thì câu chung; message không lộ nội dung', () => {
    expect(
      describeActivity(make('job-offer.received', { companyName: 'Công ty Alpha' })).title,
    ).toBe('Công ty Alpha đã gửi lời mời cho bạn');
    expect(describeActivity(make('job-offer.received', {})).title).toBe(
      'Bạn có lời mời việc làm mới',
    );
    expect(describeActivity(make('job-offer.message', { offerId: 'o1' })).title).toBe(
      'Có tin nhắn mới trong một lời mời việc làm',
    );
    expect(describeActivity(make('job-offer.responded', { status: 'INTERESTED' })).title).toBe(
      'Một ứng viên quan tâm lời mời của bạn',
    );
  });

  it('company.status-changed nói đúng trạng thái; trạng thái lạ vẫn có câu, không rơi về câu chung', () => {
    expect(describeActivity(make('company.status-changed', { status: 'SUSPENDED' })).title).toBe(
      'Doanh nghiệp của bạn đang tạm ngưng',
    );
    expect(describeActivity(make('company.status-changed', { status: 'APPROVED' })).title).toBe(
      'Doanh nghiệp của bạn đã được duyệt',
    );
    expect(describeActivity(make('company.status-changed', { status: 'LA' })).title).not.toBe(
      'Bạn có thông báo mới',
    );
  });
});

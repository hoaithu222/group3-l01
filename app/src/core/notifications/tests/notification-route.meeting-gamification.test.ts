import { hrefForTarget, hrefOrActivity } from '../notification-route';
import { resolvePushHref } from '../push-router';

/**
 * p2-04 (họp) và p4-03 (gamification): loại thông báo theo quy ước chữ thường-dấu chấm của BE
 * (`meeting.invited`, `gamification.level-up`…) — xem `be/src/modules/meetings` và `be/src/modules/gamification`.
 */
describe('hrefForTarget — họp (p2-04)', () => {
  it.each(['meeting.invited', 'meeting.updated', 'meeting.cancelled', 'meeting.reminder'])(
    '%s có meetingId → chi tiết cuộc họp',
    (type) => {
      expect(hrefForTarget({ meetingId: 'm1', type })).toEqual({
        params: { meetingId: 'm1' },
        pathname: '/meetings/[meetingId]',
      });
    },
  );

  // p2-06: biên bản/ghi hình đi qua `meeting-recap-route.ts` (đặt TRƯỚC `meeting.*` ở `hrefForTarget`).
  it('meeting.recap-published → màn XEM biên bản (không còn về chi tiết cuộc họp)', () => {
    expect(hrefForTarget({ meetingId: 'm1', type: 'meeting.recap-published' })).toEqual({
      params: { meetingId: 'm1' },
      pathname: '/meetings/[meetingId]/recap',
    });
  });

  it.each(['meeting.recap-required', 'meeting.recap-reminder'])(
    '%s → màn SOẠN biên bản',
    (type) => {
      expect(hrefForTarget({ meetingId: 'm1', type })).toEqual({
        params: { meetingId: 'm1' },
        pathname: '/meetings/[meetingId]/recap-edit',
      });
    },
  );

  it('push nhắc biên bản = meeting.reminder + kind RECAP → soạn biên bản; nhắc giờ họp thường vẫn về chi tiết', () => {
    expect(
      resolvePushHref({ kind: 'RECAP', meetingId: 'm9', targetUserId: 'u1', type: 'meeting.reminder' }),
    ).toEqual({ params: { meetingId: 'm9' }, pathname: '/meetings/[meetingId]/recap-edit' });
    expect(
      resolvePushHref({ meetingId: 'm9', targetUserId: 'u1', type: 'meeting.reminder' }),
    ).toEqual({ params: { meetingId: 'm9' }, pathname: '/meetings/[meetingId]' });
  });

  it('meeting.recording-ready mở đúng bản ghi khi có recordingId, không thì danh sách bản ghi', () => {
    expect(
      hrefForTarget({ meetingId: 'm1', recordingId: 'r1', type: 'meeting.recording-ready' }),
    ).toEqual({
      params: { meetingId: 'm1', recordingId: 'r1' },
      pathname: '/meetings/[meetingId]/recordings/[recordingId]',
    });
    expect(hrefForTarget({ meetingId: 'm1', type: 'meeting.recording-ready' })).toEqual({
      params: { meetingId: 'm1' },
      pathname: '/meetings/[meetingId]/recordings',
    });
  });

  it('meeting.started mở thẳng phòng họp (p2-05), không qua chi tiết', () => {
    expect(hrefForTarget({ meetingId: 'm1', type: 'meeting.started' })).toEqual({
      params: { meetingId: 'm1' },
      pathname: '/meeting-room/[meetingId]',
    });
  });

  it('meeting.role-changed có meetingId → chi tiết cuộc họp', () => {
    expect(hrefForTarget({ meetingId: 'm1', type: 'meeting.role-changed' })).toEqual({
      params: { meetingId: 'm1' },
      pathname: '/meetings/[meetingId]',
    });
  });

  it('meeting.removed (bị xoá khỏi danh sách) → LỊCH, không phải chi tiết sẽ 403/404', () => {
    expect(hrefForTarget({ meetingId: 'm1', type: 'meeting.removed' })).toBe('/meetings');
  });

  it('thiếu meetingId → null, và hrefOrActivity rơi về hộp thư', () => {
    expect(hrefForTarget({ type: 'meeting.invited' })).toBeNull();
    expect(hrefOrActivity({ type: 'meeting.invited' })).toBe('/activity');
  });

  it('push mang meetingId trong data → mở đúng cuộc họp', () => {
    expect(
      resolvePushHref({ meetingId: 'm9', targetUserId: 'u1', type: 'meeting.reminder' }),
    ).toEqual({ params: { meetingId: 'm9' }, pathname: '/meetings/[meetingId]' });
  });
});

// p6-03: điểm NỐI `mentor.*` vào `hrefForTarget` (bảng đích chi tiết ở `mentor-route.test.ts`) — thiếu dòng nối thì loại này rơi về hộp thư.
describe('hrefForTarget — mentor (p6-03)', () => {
  it('mentor.application có workspaceId + postId → màn duyệt đơn của bài (cả push lẫn hộp thư đi cùng đường)', () => {
    const target = { postId: 'p1', type: 'mentor.application', workspaceId: 'w1' };
    expect(hrefForTarget(target)).toBe('/workspaces/w1/mentor/p1/applications');
    expect(resolvePushHref({ ...target, targetUserId: 'u1' })).toBe(
      '/workspaces/w1/mentor/p1/applications',
    );
  });

  it('mentor.rejected không cần id → tab "Đơn của tôi" của bảng tin', () => {
    expect(hrefForTarget({ type: 'mentor.rejected' })).toBe('/mentor?tab=applications');
  });
});

describe('hrefForTarget — gamification (p4-03)', () => {
  it.each(['gamification.level-up', 'gamification.badge-unlocked'])(
    '%s → màn Thành tích (không cần id)',
    (type) => {
      expect(hrefForTarget({ type })).toBe('/me/achievements');
      expect(resolvePushHref({ targetUserId: 'u1', type })).toBe('/me/achievements');
    },
  );
});

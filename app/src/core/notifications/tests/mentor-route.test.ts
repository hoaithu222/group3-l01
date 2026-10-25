import { isMentorType, mentorHref } from '../mentor-route';
import type { NotificationTarget } from '../notification-target.types';
import { parsePushPayload } from '../push-payload.types';

/**
 * Bảng `mentor.* → route` (p6-03). Khoá các quyết định dễ sai mà `tsc` không thấy: cùng một loại thông báo tới CẢ cố vấn lẫn nhóm nên đích
 * phải tách theo phạm vi (`scopeType`); người bị gỡ khỏi nhóm không được đẩy vào tổng quan nhóm; thiếu id thì rơi về màn cha thay vì `null`.
 */
function target(overrides: Partial<NotificationTarget> & { type: string }): NotificationTarget {
  return overrides;
}

describe('isMentorType', () => {
  it('chỉ nhận tiền tố `mentor.`', () => {
    expect(isMentorType('mentor.accepted')).toBe(true);
    expect(isMentorType('mentor.post-hidden')).toBe(true);
    expect(isMentorType('mentorship')).toBe(false);
    expect(isMentorType('task.assigned')).toBe(false);
  });
});

describe('mentorHref', () => {
  it('mentor.application → màn duyệt đơn của ĐÚNG bài; thiếu postId → quản lý bài của nhóm; thiếu nhóm → null', () => {
    expect(
      mentorHref(target({ postId: 'p1', type: 'mentor.application', workspaceId: 'ws' })),
    ).toBe('/workspaces/ws/mentor/p1/applications');
    expect(mentorHref(target({ type: 'mentor.application', workspaceId: 'ws' }))).toBe(
      '/workspaces/ws/mentor',
    );
    expect(mentorHref(target({ postId: 'p1', type: 'mentor.application' }))).toBeNull();
  });

  it('mentor.accepted → nhóm chat cố vấn khi có; không có nhóm chat → tổng quan nhóm; thiếu cả hai → tab Đang cố vấn', () => {
    expect(
      mentorHref(target({ conversationId: 'cv', type: 'mentor.accepted', workspaceId: 'ws' })),
    ).toBe('/messages/cv');
    expect(mentorHref(target({ type: 'mentor.accepted', workspaceId: 'ws' }))).toBe(
      '/workspaces/ws',
    );
    expect(mentorHref(target({ type: 'mentor.accepted' }))).toBe('/mentor?tab=engaged');
  });

  it('mentor.rejected → tab "Đơn của tôi" (không cần id nào)', () => {
    expect(mentorHref(target({ type: 'mentor.rejected' }))).toBe('/mentor?tab=applications');
    expect(mentorHref(target({ postId: 'p1', type: 'mentor.rejected', workspaceId: 'ws' }))).toBe(
      '/mentor?tab=applications',
    );
  });

  it('ending-soon / ended: phía NHÓM (scopeType WORKSPACE) → quản lý cố vấn của nhóm; phía CỐ VẤN → tab Đang cố vấn, không vào nhóm', () => {
    for (const type of ['mentor.ending-soon', 'mentor.ended']) {
      expect(mentorHref(target({ scopeType: 'WORKSPACE', type, workspaceId: 'ws' }))).toBe(
        '/workspaces/ws/mentor',
      );
      // Cố vấn (không phạm vi): sau `mentor.ended` họ không còn là thành viên nên tổng quan nhóm sẽ đá họ ra.
      expect(mentorHref(target({ type, workspaceId: 'ws' }))).toBe('/mentor?tab=engaged');
    }
    // Phía nhóm nhưng thiếu workspaceId → không dựng được đường dẫn nhóm, rơi về tab của cố vấn.
    expect(mentorHref(target({ scopeType: 'WORKSPACE', type: 'mentor.ended' }))).toBe(
      '/mentor?tab=engaged',
    );
  });

  it('mentor.post-hidden → quản lý bài của nhóm; thiếu workspaceId → null (rơi về hộp thư)', () => {
    expect(mentorHref(target({ type: 'mentor.post-hidden', workspaceId: 'ws' }))).toBe(
      '/workspaces/ws/mentor',
    );
    expect(mentorHref(target({ type: 'mentor.post-hidden' }))).toBeNull();
  });

  it('loại mentor.* lạ → bảng tin', () => {
    expect(mentorHref(target({ type: 'mentor.something-new', workspaceId: 'ws' }))).toBe('/mentor');
  });
});

describe('parsePushPayload — khoá dữ liệu của mentor.*', () => {
  it('giữ postId/applicationId/engagementId/conversationId (BE `dataKeys`), bỏ khoá lạ', () => {
    const payload = parsePushPayload({
      applicationId: 'a1',
      conversationId: 'cv1',
      engagementId: 'e1',
      evil: 'x',
      postId: 'p1',
      targetUserId: 'u1',
      type: 'mentor.accepted',
      workspaceId: 'ws',
    });

    expect(payload).toEqual({
      applicationId: 'a1',
      conversationId: 'cv1',
      engagementId: 'e1',
      postId: 'p1',
      targetUserId: 'u1',
      type: 'mentor.accepted',
      workspaceId: 'ws',
    });
  });
});

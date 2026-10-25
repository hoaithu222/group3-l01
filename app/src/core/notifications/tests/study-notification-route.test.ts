import { hrefForTarget, hrefOrActivity } from '../notification-route';
import { parsePushPayload } from '../push-payload.types';
import { decidePushTap, resolvePushHref } from '../push-router';

/**
 * Chạm push của phân hệ Học (p4-02 app.md §1: `SR_DUE_REMINDER` → `/study/sr`, `MOCK_AUTO_SUBMITTED` → kết quả lượt thi).
 * Khoá theo type THẬT của BE (`be/src/modules/study/notifications/study.notification-types.ts`), không theo tên hằng số.
 */
function payload(overrides: Record<string, string>) {
  const parsed = parsePushPayload({ targetUserId: 'user-me', ...overrides });
  if (!parsed) throw new Error('payload dựng sai');
  return parsed;
}

describe('study.sr-due-reminder', () => {
  it('→ phiên ôn theo lịch (không cần id nào)', () => {
    expect(resolvePushHref(payload({ dueCount: '24', type: 'study.sr-due-reminder' }))).toBe(
      '/study/sr',
    );
    expect(hrefForTarget({ type: 'study.sr-due-reminder' })).toBe('/study/sr');
  });

  it('người dùng đã đăng nhập đúng tài khoản → navigate; sai tài khoản → bỏ (NT-07)', () => {
    const p = payload({ type: 'study.sr-due-reminder' });
    expect(decidePushTap(p, { authenticated: true, userId: 'user-me' })).toEqual({
      href: '/study/sr',
      kind: 'navigate',
    });
    expect(decidePushTap(p, { authenticated: true, userId: 'khac' })).toEqual({
      kind: 'ignored',
      reason: 'other-user',
    });
  });
});

describe('study.mock-auto-submitted', () => {
  it('attemptId nằm trong khoá data được giữ lại và mở ĐÚNG kết quả lượt đó', () => {
    const p = payload({ attemptId: 'att-1', setId: 'set-1', type: 'study.mock-auto-submitted' });
    expect(p.attemptId).toBe('att-1');
    expect(p).not.toHaveProperty('setId'); // khoá lạ vẫn bị bỏ — payload push không đáng tin
    expect(resolvePushHref(p)).toEqual({
      params: { attemptId: 'att-1' },
      pathname: '/study/results/[attemptId]',
    });
  });

  it('thiếu attemptId → không dựng được đích: null, push về hộp thư Hoạt động', () => {
    expect(hrefForTarget({ type: 'study.mock-auto-submitted' })).toBeNull();
    expect(hrefOrActivity({ type: 'study.mock-auto-submitted' })).toBe('/activity');
    expect(resolvePushHref(payload({ type: 'study.mock-auto-submitted' }))).toBe('/activity');
  });
});

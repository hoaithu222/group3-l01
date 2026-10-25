import { isJobOfferType, jobOfferHref } from '../job-offer-route';
import { hrefForTarget, hrefOrActivity } from '../notification-route';
import { decidePushTap, resolvePushHref } from '../push-router';
import { parsePushPayload } from '../push-payload.types';

/**
 * p6-08 CR-47 (phần app, không cần thiết bị): chạm thông báo lời mời mở ĐÚNG chi tiết/thread; push chỉ mang id (`offerId`), khoá lạ bị bỏ, push của người khác trên cùng máy bị bỏ.
 * Loại `job-offer.*` của BE: `received` (sinh viên) → chi tiết, `message` → thread, `responded` (dành cho HR trên admin web) → không có màn trong app.
 */
describe('isJobOfferType', () => {
  it('chỉ nhận tiền tố `job-offer.`', () => {
    expect(isJobOfferType('job-offer.received')).toBe(true);
    expect(isJobOfferType('job-offer.message')).toBe(true);
    expect(isJobOfferType('job-offers')).toBe(false);
    expect(isJobOfferType('company.status-changed')).toBe(false);
  });
});

describe('jobOfferHref / hrefForTarget', () => {
  it('received → chi tiết lời mời; message → thread; id được mã hoá', () => {
    expect(jobOfferHref({ offerId: 'o1', type: 'job-offer.received' })).toBe(
      '/me/career/offers/o1',
    );
    expect(jobOfferHref({ offerId: 'o1', type: 'job-offer.message' })).toBe(
      '/me/career/offers/o1/thread',
    );
    expect(jobOfferHref({ offerId: 'a b', type: 'job-offer.received' })).toBe(
      '/me/career/offers/a%20b',
    );
  });

  it('thiếu offerId ⇒ hộp thư lời mời (không null, không 404); responded ⇒ null (hộp thư Hoạt động lo)', () => {
    expect(jobOfferHref({ type: 'job-offer.received' })).toBe('/me/career/offers');
    expect(jobOfferHref({ type: 'job-offer.message' })).toBe('/me/career/offers');
    expect(jobOfferHref({ offerId: 'o1', type: 'job-offer.responded' })).toBeNull();
  });

  it('nối vào bảng chung: hrefForTarget đi tới job-offer; responded rơi về hộp thư Hoạt động', () => {
    expect(hrefForTarget({ offerId: 'o9', type: 'job-offer.received' })).toBe(
      '/me/career/offers/o9',
    );
    expect(hrefForTarget({ type: 'job-offer.responded' })).toBeNull();
    expect(hrefOrActivity({ type: 'job-offer.responded' })).toBe('/activity');
  });
});

describe('push → đích', () => {
  it('parsePushPayload giữ offerId (đã nằm trong danh sách khoá đọc) và bỏ khoá lạ (không tiêu đề/nội dung)', () => {
    const payload = parsePushPayload({
      message: 'không được đi qua',
      offerId: 'o1',
      targetUserId: 'u1',
      title: 'không được đi qua',
      type: 'job-offer.received',
    });
    expect(payload).toEqual({ offerId: 'o1', targetUserId: 'u1', type: 'job-offer.received' });
  });

  it('chạm push received/message mở đúng màn; push của người khác trên cùng máy bị bỏ (NT-07)', () => {
    const received = parsePushPayload({
      offerId: 'o1',
      targetUserId: 'u1',
      type: 'job-offer.received',
    });
    const message = parsePushPayload({
      offerId: 'o1',
      targetUserId: 'u1',
      type: 'job-offer.message',
    });
    if (!received || !message) throw new Error('payload phải parse được');
    expect(resolvePushHref(received)).toBe('/me/career/offers/o1');
    expect(resolvePushHref(message)).toBe('/me/career/offers/o1/thread');

    expect(decidePushTap(received, { authenticated: true, userId: 'u1' })).toEqual({
      href: '/me/career/offers/o1',
      kind: 'navigate',
    });
    expect(decidePushTap(received, { authenticated: true, userId: 'nguoi-khac' })).toEqual({
      kind: 'ignored',
      reason: 'other-user',
    });
    expect(decidePushTap(received, { authenticated: false, userId: null })).toEqual({
      kind: 'ignored',
      reason: 'not-authenticated',
    });
  });
});

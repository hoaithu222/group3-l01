import { hrefForTarget, hrefOrActivity } from '../notification-route';
import { parsePushPayload } from '../push-payload.types';
import { decidePushTap } from '../push-router';

/**
 * p6-07 (app.md §1): `portfolio.build-failed` / `portfolio.taken-down` (BE `be/src/modules/portfolio/notifications/portfolio.notification-types.ts`; kế hoạch gọi là PORTFOLIO_BUILD_FAILED / PORTFOLIO_TAKEN_DOWN)
 * mở TỔNG QUAN portfolio — nơi có thẻ trạng thái "tạo trang thất bại + Thử lại" và câu "hồ sơ đã bị gỡ". Push chỉ mang `portfolioId`/`buildId` (không lộ lý do gỡ), màn tự tải hồ sơ nên không cần id.
 */
const PORTFOLIO = '/me/career/portfolio';

describe('hrefForTarget — portfolio (p6-07)', () => {
  it.each(['portfolio.build-failed', 'portfolio.taken-down'])(
    '%s → tổng quan Portfolio, không cần id',
    (type) => {
      expect(hrefForTarget({ type })).toBe(PORTFOLIO);
      expect(hrefOrActivity({ type })).toBe(PORTFOLIO);
    },
  );

  it('không nuốt loại lạ: `portfolio` trơn/tiền tố khác vẫn rơi về hộp thư', () => {
    expect(hrefOrActivity({ type: 'portfolios.other' })).toBe('/activity');
    expect(hrefOrActivity({ type: 'portfolio' })).toBe('/activity');
  });
});

describe('push — portfolio (p6-07)', () => {
  it('chạm push của chính mình ⇒ điều hướng tới Portfolio; push của người khác bị bỏ (máy đổi tài khoản)', () => {
    const payload = parsePushPayload({
      buildId: 'b-1',
      portfolioId: 'pf-1',
      targetUserId: 'user-me',
      type: 'portfolio.build-failed',
    });
    expect(decidePushTap(payload, { authenticated: true, userId: 'user-me' })).toEqual({
      href: PORTFOLIO,
      kind: 'navigate',
    });
    expect(decidePushTap(payload, { authenticated: true, userId: 'user-khac' })).toEqual({
      kind: 'ignored',
      reason: 'other-user',
    });
  });
});

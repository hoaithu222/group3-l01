import { router } from 'expo-router';

import {
  consumePostLoginIntent,
  redirectToPostLoginIntent,
  savePostLoginIntent,
  toPostLoginPath,
} from '../post-login-intent';

/**
 * Link ngắn mở lúc CHƯA đăng nhập phải sống sót qua bước đăng nhập — đặc biệt `/live/{pin}`,
 * nơi PIN Live Quiz từng rơi mất: `app/live/[pin].tsx` chỉ `<Redirect>` sang màn tham gia trong
 * `(app)`, hàng rào của `(app)` đẩy sang `/login`, đích biến mất.
 */

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
const mockedReplace = router.replace as jest.MockedFunction<typeof router.replace>;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe('toPostLoginPath', () => {
  it.each([
    ['https://app.vidu.vn/live/123456', '/live/123456'],
    ['superapp://live/123456', '/live/123456'],
    ['superapp://m/abc123', '/m/abc123'],
    ['https://app.vidu.vn/s/set-1', '/s/set-1'],
    ['https://app.vidu.vn/w/ws1', '/w/ws1'],
    ['https://app.vidu.vn/w/ws1/c/ch1/t/msg1', '/w/ws1/c/ch1/t/msg1'],
    ['https://app.vidu.vn/live/123456/', '/live/123456'],
    // p0-12: link hội thoại `/c/{conversationId}?m=` (`app/c/[conversationId].tsx`) cũng phải sống sót qua đăng nhập.
    ['https://app.vidu.vn/c/conv1', '/c/conv1'],
    ['superapp://c/conv1?m=msg_1&token=BI-MAT', '/c/conv1?m=msg_1'],
  ])('%s ⇒ %s', (url, expected) => {
    expect(toPostLoginPath(url)).toBe(expected);
  });

  it('giữ tham số `m` (id tin nhắn) và BỎ mọi tham số khác — không mang mã bí mật đi cùng', () => {
    expect(toPostLoginPath('https://x.vn/w/ws1/c/ch1?m=msg_1&token=BI-MAT&code=999')).toBe(
      '/w/ws1/c/ch1?m=msg_1',
    );
  });

  const REJECTED = [
    'https://x.vn/invite/abc', // lời mời đã có cơ chế riêng (pendingInvite)
    'https://x.vn/reset-password?token=t', // ⛔ không bao giờ nhớ link mang token đặt lại mật khẩu
    'superapp://reset-password?token=t',
    'https://x.vn/login',
    'https://x.vn/live/',
    'https://x.vn/live/../login',
    'https://x.vn/w/a b',
    'javascript:alert(1)',
    'not-a-url',
    '',
    `https://x.vn/w/${'a'.repeat(400)}`,
  ];

  it.each(REJECTED.map((url) => [url.slice(0, 48), url]))('từ chối %s', (_label, url) => {
    expect(toPostLoginPath(url as string)).toBeNull();
  });
});

describe('lưu / dùng một lần', () => {
  it('consume trả đúng đường dẫn đã lưu rồi XOÁ (dùng một lần)', async () => {
    await savePostLoginIntent('/live/123456');

    expect(await consumePostLoginIntent()).toBe('/live/123456');
    expect(await consumePostLoginIntent()).toBeNull();
  });

  it('quá 30 phút ⇒ bỏ (link hôm qua không được lôi người đăng nhập hôm nay)', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-25T10:00:00Z'));
    await savePostLoginIntent('/live/123456');

    jest.setSystemTime(new Date('2026-09-25T10:31:00Z'));

    expect(await consumePostLoginIntent()).toBeNull();
  });

  it('dữ liệu trên đĩa bị sửa thành đường dẫn KHÔNG được phép ⇒ bỏ', async () => {
    await savePostLoginIntent('/reset-password?token=abc');

    expect(await consumePostLoginIntent()).toBeNull();
  });
});

describe('redirectToPostLoginIntent', () => {
  it('có ý định ⇒ router.replace (không push) và trả true', async () => {
    await savePostLoginIntent('/live/123456');

    expect(await redirectToPostLoginIntent()).toBe(true);
    expect(mockedReplace).toHaveBeenCalledWith('/live/123456');
  });

  it('không có ⇒ không điều hướng, trả false', async () => {
    expect(await redirectToPostLoginIntent()).toBe(false);
    expect(mockedReplace).not.toHaveBeenCalled();
  });
});

/**
 * Hàng đợi làm mới token — phần tinh tế nhất của tầng HTTP.
 *
 * Hai hành vi phải giữ bằng mọi giá:
 *
 * 1. **Xếp hàng.** 5 request cùng ăn 401 thì chỉ MỘT lượt refresh chạy; 4
 *    request kia chờ rồi dùng token mới. Nếu cả 5 cùng gọi refresh, refresh
 *    token xoay vòng ở BE khiến 4 lời gọi sau mang cookie đã vô hiệu →
 *    phiên chết oan.
 *
 * 2. **`unavailable` KHÔNG giết phiên.** Mất mạng hay BE trả 5xx thì giữ
 *    nguyên phiên; chỉ khi máy chủ nói thẳng "phiên chết" (`unauthenticated`)
 *    mới dọn và đá về trang đăng nhập. Gộp hai ca này làm một là bug kinh
 *    điển — một cú chập mạng cuốn sạch việc người dùng đang làm dở.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const refreshSession = vi.fn();
const purgeAuthSession = vi.fn();

vi.mock('@/core/api/session', () => ({
  refreshSession: (...a: unknown[]) => refreshSession(...a),
  purgeAuthSession: (...a: unknown[]) => purgeAuthSession(...a),
  getAccessToken: () => null,
}));

const {
  beginRefresh,
  drainQueue,
  endRefresh,
  isRefreshInFlight,
  refreshAccessToken,
  waitForNewToken,
} = await import('@/core/api/client.refresh');

describe('cờ đang-refresh', () => {
  beforeEach(() => endRefresh());

  it('bật rồi tắt được', () => {
    expect(isRefreshInFlight()).toBe(false);
    beginRefresh();
    expect(isRefreshInFlight()).toBe(true);
    endRefresh();
    expect(isRefreshInFlight()).toBe(false);
  });
});

describe('hàng đợi', () => {
  it('mọi request đang chờ đều nhận CÙNG token mới', async () => {
    const waiters = [waitForNewToken(), waitForNewToken(), waitForNewToken()];
    drainQueue(null, 'token-moi');
    await expect(Promise.all(waiters)).resolves.toEqual(['token-moi', 'token-moi', 'token-moi']);
  });

  it('refresh hỏng thì mọi request đang chờ bị từ chối bằng CHÍNH lỗi gốc', async () => {
    const original = Object.assign(new Error('401'), { response: { status: 401 } });
    const waiter = waitForNewToken();
    drainQueue(original, null);
    // Giữ nguyên `response` — mất nó là consumer không đọc được status và toast
    // rơi về câu mặc định.
    await expect(waiter).rejects.toBe(original);
  });

  it('xả xong thì hàng đợi rỗng, lượt sau không ăn lại kết quả cũ', async () => {
    const first = waitForNewToken();
    drainQueue(null, 'a');
    await expect(first).resolves.toBe('a');

    const second = waitForNewToken();
    drainQueue(null, 'b');
    await expect(second).resolves.toBe('b');
  });
});

describe('refreshAccessToken', () => {
  beforeEach(() => {
    refreshSession.mockReset();
    purgeAuthSession.mockReset();
  });

  it('thành công → trả token mới, KHÔNG đụng tới phiên', async () => {
    refreshSession.mockResolvedValue({ status: 'ok', token: 'token-moi' });
    await expect(refreshAccessToken()).resolves.toBe('token-moi');
    expect(purgeAuthSession).not.toHaveBeenCalled();
  });

  it('⛔ `unavailable` (mạng chập / 5xx) GIỮ NGUYÊN phiên', async () => {
    refreshSession.mockResolvedValue({ status: 'unavailable', reason: 'network' });
    await expect(refreshAccessToken()).resolves.toBeNull();
    expect(purgeAuthSession).not.toHaveBeenCalled();
  });

  // jsdom in "Not implemented: navigation to another Document" ở ca này vì
  // `window.location.assign` không điều hướng thật. Tiếng ồn vô hại — cố tình
  // KHÔNG stub, vì `location` của jsdom không cho ghi đè và mọi cách lách đều
  // làm hỏng ca kiểm khác.
  it('`unauthenticated` (máy chủ nói phiên chết) mới dọn phiên', async () => {
    refreshSession.mockResolvedValue({ status: 'unauthenticated' });
    await expect(refreshAccessToken()).resolves.toBeNull();
    expect(purgeAuthSession).toHaveBeenCalledTimes(1);
  });
});

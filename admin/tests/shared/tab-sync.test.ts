/**
 * `tab-sync.utils` — gửi/nhận tin giữa các tab. Phần THUẦN (không React) mà `useMultiTabSync` và
 * tầng HTTP (đồng bộ đăng xuất) cùng dùng.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { postTabMessage, subscribeTabMessages } from '@/shared/utils/browser/tab-sync.utils';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const flushChannel = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('BroadcastChannel', () => {
  it('tin gửi đi đến được người đăng ký (kể cả cùng tab — đối tượng kênh khác nhau)', async () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeTabMessages<{ n: number }>('kenh-thu', (m) => received.push(m));

    postTabMessage('kenh-thu', { n: 1 });
    postTabMessage('kenh-thu', { n: 2 });
    await flushChannel();
    unsubscribe();

    expect(received).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('kênh khác tên không nhận tin', async () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeTabMessages('kenh-a', (m) => received.push(m));

    postTabMessage('kenh-b', { n: 1 });
    await flushChannel();
    unsubscribe();

    expect(received).toEqual([]);
  });

  it('huỷ đăng ký rồi thì không nhận nữa', async () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeTabMessages('kenh-huy', (m) => received.push(m));
    unsubscribe();

    postTabMessage('kenh-huy', { n: 1 });
    await flushChannel();

    expect(received).toEqual([]);
  });
});

// ⚠️ Spy trên `Storage.prototype`, KHÔNG phải trên `localStorage`: gán `localStorage.setItem = …` ở jsdom kích
// setter đặt tên của Storage (lưu một MỤC tên "setItem") thay vì thay method.
describe('dự phòng `storage` (trình duyệt không có BroadcastChannel)', () => {
  it('nhận tin qua sự kiện `storage`, bỏ qua khoá khác và giá trị rỗng/hỏng', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const received: unknown[] = [];
    const unsubscribe = subscribeTabMessages('auth', (m) => received.push(m));

    const fire = (key: string | null, newValue: string | null) =>
      window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
    fire('app:sync:auth', JSON.stringify({ _t: 1, payload: { type: 'ended' } }));
    fire('khoa-khac', JSON.stringify({ _t: 1, payload: { type: 'sai-kenh' } }));
    fire('app:sync:auth', null); // bước `removeItem` của phía gửi
    fire('app:sync:auth', '{khong-phai-json');
    unsubscribe();
    fire('app:sync:auth', JSON.stringify({ _t: 2, payload: { type: 'sau-khi-huy' } }));

    expect(received).toEqual([{ type: 'ended' }]);
  });

  it('gửi tin ⇒ ghi rồi xoá ngay khoá để kích `storage` ở tab khác mà không để lại rác', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');

    postTabMessage('auth', { type: 'ended' });

    expect(setItem).toHaveBeenCalledWith('app:sync:auth', expect.stringContaining('"type":"ended"'));
    expect(removeItem).toHaveBeenCalledWith('app:sync:auth');
  });

  it('BroadcastChannel ném lỗi lúc khởi tạo ⇒ rơi xuống `storage`, không ném ra ngoài', () => {
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor() {
          throw new Error('SecurityError');
        }
      },
    );
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    expect(() => postTabMessage('auth', { type: 'ended' })).not.toThrow();
    expect(setItem).toHaveBeenCalled();
  });

  it('localStorage bị chặn (chế độ riêng tư nghiêm ngặt) ⇒ không ném lỗi', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });

    expect(() => postTabMessage('auth', { type: 'ended' })).not.toThrow();
  });
});

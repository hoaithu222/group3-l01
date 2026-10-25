import { flush, notice, setup } from './controller.harness';
import { WB_ID } from './wb.harness';

jest.useFakeTimers();

describe('nối và trạng thái', () => {
  it('cổng nhận `documentName` NGUYÊN VĂN từ grant, và hàm `token` (không phải chuỗi) lấy từ CollabTokenProvider', async () => {
    const { port, tokens } = setup();
    expect(port.options.documentName).toBe(`wb:${WB_ID}`);
    expect(typeof port.options.token).toBe('function');
    await expect(port.options.token()).resolves.toBe('t-ensure');
    expect(tokens.ensure).toHaveBeenCalledTimes(1);
    expect(port.connect).toHaveBeenCalledTimes(1);
  });

  it('connecting → synced khi socket mở + xác thực + đồng bộ; mất socket → offline (giữ nội dung, tự hợp nhất khi nối lại)', () => {
    const { lastSnapshot, port } = setup();
    expect(lastSnapshot()?.connection).toBe('connecting');
    port.goLive();
    expect(lastSnapshot()).toMatchObject({
      connection: 'synced',
      everSynced: true,
      serverReadOnly: false,
    });
    port.options.handlers.onStatus('disconnected');
    expect(lastSnapshot()?.connection).toBe('offline');
  });

  it('scope `readonly` → serverReadOnly (viewer); đổi số thay đổi chưa xác nhận → unsynced', () => {
    const { lastSnapshot, port } = setup();
    port.goLive('readonly');
    expect(lastSnapshot()?.serverReadOnly).toBe(true);
    port.options.handlers.onUnsyncedChanges(3);
    expect(lastSnapshot()?.unsynced).toBe(true);
    port.options.handlers.onUnsyncedChanges(0);
    expect(lastSnapshot()?.unsynced).toBe(false);
  });

  it('thông báo server: SAVE_FAILED/RECOVERED, READ_ONLY, ARCHIVED, TOO_LARGE (README §3.5)', () => {
    const { host, lastSnapshot, port } = setup();
    port.goLive();
    const send = (code: string) => port.options.handlers.onStateless(notice(code));
    send('SAVE_FAILED');
    expect(lastSnapshot()?.saveFailed).toBe(true);
    send('SAVE_RECOVERED');
    expect(lastSnapshot()?.saveFailed).toBe(false);
    send('READ_ONLY');
    expect(lastSnapshot()?.serverReadOnly).toBe(true);
    send('ARCHIVED');
    expect(lastSnapshot()).toMatchObject({ archived: true, serverReadOnly: true });
    send('TOO_LARGE');
    expect(lastSnapshot()?.tooLarge).toBe(true);
    expect(host.onNotice).toHaveBeenCalledWith('TOO_LARGE');
    port.options.handlers.onStateless('rác'); // không ném, không báo
    expect(host.onNotice).toHaveBeenCalledTimes(5);
  });
});

describe('từ chối và đóng kết nối (§3.4)', () => {
  it('forbidden → DỪNG NGAY (disconnect), lỗi nghiêm trọng FORBIDDEN, không nối lại dù chờ lâu; tới HAI lần vẫn chỉ một lỗi (idempotent)', async () => {
    const { host, lastSnapshot, port } = setup();
    port.goLive();
    port.options.handlers.onAuthenticationFailed('forbidden');
    port.options.handlers.onClose({ code: 4403, reason: 'forbidden' });
    // `null` (xoá lỗi tạm) đã bắn lúc goLive; ở đây chỉ đếm LỖI THẬT: đúng một dù tin tới hai lần.
    expect(host.onFailure.mock.calls.filter(([failure]) => failure !== null)).toEqual([
      [{ code: 'FORBIDDEN', fatal: true }],
    ]);
    expect(lastSnapshot()?.connection).toBe('closed');
    expect(port.disconnect).toHaveBeenCalled();
    const connects = port.connect.mock.calls.length;
    await jest.advanceTimersByTimeAsync(120_000);
    expect(port.connect.mock.calls.length).toBe(connects);
  });

  it('1009 (khung > 6 MiB) → dừng "quá lớn" — nối lại sẽ lặp vô hạn', () => {
    const { host, port } = setup();
    port.options.handlers.onClose({ code: 1009, reason: '' });
    expect(host.onFailure).toHaveBeenCalledWith({ code: 'TOO_LARGE', fatal: true });
  });

  it('unauthorized → xin token MỚI rồi nối lại; sau 2 lượt liên tiếp mà vẫn bị từ chối thì báo AUTH_EXPIRED (không dồn BE)', async () => {
    const { host, port, tokens } = setup();
    port.goLive();
    port.options.handlers.onAuthenticationFailed('unauthorized');
    await flush();
    expect(tokens.refresh).toHaveBeenCalledTimes(1);
    expect(port.connect).toHaveBeenCalledTimes(2); // lần đầu + sau khi có token mới

    port.options.handlers.onAuthenticationFailed('unauthorized');
    await flush();
    expect(tokens.refresh).toHaveBeenCalledTimes(2);

    port.options.handlers.onAuthenticationFailed('unauthorized');
    await flush();
    expect(tokens.refresh).toHaveBeenCalledTimes(2);
    expect(host.onFailure).toHaveBeenLastCalledWith({ code: 'AUTH_EXPIRED', fatal: false });
  });

  it('rate-limited/unavailable → dừng nối tự động rồi nối lại sau backoff (2 s), không dồn dập', async () => {
    const { port } = setup();
    port.goLive();
    port.options.handlers.onClose({ code: 4429, reason: 'rate-limited' });
    port.options.handlers.onClose({ code: 4429, reason: 'rate-limited' }); // lượt thứ hai của cùng một lần đóng
    const connects = port.connect.mock.calls.length;
    await jest.advanceTimersByTimeAsync(1999);
    expect(port.connect.mock.calls.length).toBe(connects);
    await jest.advanceTimersByTimeAsync(2);
    expect(port.connect.mock.calls.length).toBe(connects + 1);
  });

  it('archived → cờ archived + chỉ đọc, KHÔNG dừng (provider nối lại vào chế độ xem)', () => {
    const { host, lastSnapshot, port } = setup();
    port.goLive();
    port.options.handlers.onClose({ code: 4409, reason: 'archived' });
    expect(lastSnapshot()).toMatchObject({ archived: true, serverReadOnly: true });
    expect(host.onFailure).not.toHaveBeenCalledWith(expect.objectContaining({ fatal: true }));
  });

  it('nối lại ở chế độ GHI thì hết "đã lưu trữ"', () => {
    const { lastSnapshot, port } = setup();
    port.goLive();
    port.options.handlers.onClose({ code: 4409, reason: 'archived' });
    port.goLive('read-write');
    expect(lastSnapshot()?.archived).toBe(false);
  });
});

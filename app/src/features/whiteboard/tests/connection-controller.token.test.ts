import { setup } from './controller.harness';

jest.useFakeTimers();

describe('lỗi xin token', () => {
  it('404/403 khi xin token = MẤT QUYỀN → FORBIDDEN nghiêm trọng, dừng hẳn', async () => {
    const ensure = jest.fn().mockRejectedValue(new Error('403'));
    const { host, port } = setup({ classify: 'forbidden', ensure });
    await expect(port.options.token()).rejects.toThrow('403');
    port.options.handlers.onAuthenticationFailed('Failed to get token during sendToken(): Error: 403');
    expect(host.onFailure).toHaveBeenCalledWith({ code: 'FORBIDDEN', fatal: true });
  });

  it('lỗi mạng khi xin token → TOKEN_FAILED không nghiêm trọng + hẹn nối lại (không dừng)', async () => {
    const ensure = jest.fn().mockRejectedValue(new Error('mạng'));
    const { host, port } = setup({ classify: 'retry', ensure });
    await expect(port.options.token()).rejects.toThrow('mạng');
    port.options.handlers.onAuthenticationFailed('Failed to get token during sendToken(): Error: mạng');
    expect(host.onFailure).toHaveBeenCalledWith({ code: 'TOKEN_FAILED', fatal: false });
    const connects = port.connect.mock.calls.length;
    await jest.advanceTimersByTimeAsync(2100);
    expect(port.connect.mock.calls.length).toBeGreaterThan(connects);
  });

  it('xác thực được lại thì xoá lỗi không nghiêm trọng (host.onFailure(null))', () => {
    const { host, port } = setup();
    port.goLive();
    expect(host.onFailure).toHaveBeenCalledWith(null);
  });
});

describe('hạn chờ và thử lại', () => {
  it('quá 20 s chưa đồng bộ lần nào → LOAD_FAILED không nghiêm trọng, trạng thái offline (vẫn thử tiếp)', async () => {
    const { host, lastSnapshot } = setup();
    await jest.advanceTimersByTimeAsync(20_001);
    expect(host.onFailure).toHaveBeenCalledWith({ code: 'LOAD_FAILED', fatal: false });
    expect(lastSnapshot()?.connection).toBe('offline');
  });

  it('đã đồng bộ thì không còn hạn chờ lần đầu', async () => {
    const { host, port } = setup();
    port.goLive();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(host.onFailure).not.toHaveBeenCalledWith({ code: 'LOAD_FAILED', fatal: false });
  });

  it('retry() gỡ trạng thái dừng và nối lại từ đầu', () => {
    const { controller, lastSnapshot, port } = setup();
    port.options.handlers.onClose({ code: 4404, reason: 'not-found' });
    expect(lastSnapshot()?.connection).toBe('closed');
    controller.retry();
    expect(lastSnapshot()?.connection).not.toBe('closed');
    expect(port.connect).toHaveBeenCalledTimes(2);
  });

  it('destroy() dừng mọi hẹn giờ và huỷ cổng — không nối lại sau khi rời màn', async () => {
    const { controller, host, port } = setup();
    controller.destroy();
    await jest.advanceTimersByTimeAsync(120_000);
    expect(port.destroy).toHaveBeenCalledTimes(1);
    expect(host.onFailure).not.toHaveBeenCalled();
  });
});

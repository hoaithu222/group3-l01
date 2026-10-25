import { AppState } from 'react-native';

import type { CollabGrantFetcher } from '@/shared/collab';

import { WhiteboardRuntime, type RuntimeHost } from '../collab/whiteboard-runtime';
import { WB_LIMITS, createElement, addElement } from '../engine';
import { fakePorts, makeGrant, ME, WB_ID } from './wb.harness';

jest.useFakeTimers();

const flush = () => jest.advanceTimersByTimeAsync(0);

function setup(fetchGrant: CollabGrantFetcher = jest.fn().mockResolvedValue(makeGrant())) {
  const ports = fakePorts();
  const host: jest.Mocked<RuntimeHost> = {
    onFailure: jest.fn(),
    onGranted: jest.fn(),
    onNotice: jest.fn(),
    onPeers: jest.fn(),
    onSnapshot: jest.fn(),
  };
  const runtime = new WhiteboardRuntime({
    classifyTokenError: (error) => ((error as Error).message === '404' ? 'forbidden' : 'retry'),
    createPort: ports.factory,
    fetchGrant,
    host,
    userId: ME,
  });
  return { host, ports, runtime };
}

describe('WhiteboardRuntime', () => {
  it('start: xin token → mở phiên với documentName `wb:<id>` NGUYÊN VĂN từ grant, url và user của grant; trần phần tử lấy từ grant', async () => {
    const { host, ports, runtime } = setup(
      jest.fn().mockResolvedValue(makeGrant({ elementsMax: 1234 })),
    );
    await runtime.start();
    const port = ports.last();
    expect(port.options.documentName).toBe(`wb:${WB_ID}`);
    expect(port.options.url).toBe('wss://superapp.example.com/collab');
    expect(port.options.user).toEqual({ color: '#175CD3', id: ME, name: 'Nguyễn An' });
    expect(port.connect).toHaveBeenCalledTimes(1);
    expect(host.onGranted).toHaveBeenCalledTimes(1);
    expect(runtime.elementsMax).toBe(1234);
    expect(runtime.writeContext()).toEqual({ elementsMax: 1234, userId: ME });
  });

  it('thiếu limits.elementsMax → trần cứng của engine (5000)', async () => {
    const { runtime } = setup(jest.fn().mockResolvedValue(makeGrant({ elementsMax: undefined })));
    await runtime.start();
    expect(runtime.elementsMax).toBe(WB_LIMITS.elementsMax);
  });

  it('người xem (grant.mode = view) được báo ra cho hook quyết công cụ', async () => {
    const { host, runtime } = setup(jest.fn().mockResolvedValue(makeGrant({ mode: 'view' })));
    await runtime.start();
    expect(host.onGranted).toHaveBeenCalledWith(expect.objectContaining({ mode: 'view' }));
  });

  it('awareness của phiên có publisher; ghi vào doc bằng origin = userId để undo chỉ của mình (WB-03)', async () => {
    const { runtime } = setup();
    await runtime.start();
    expect(runtime.publisher).not.toBeNull();
    const el = createElement('rect', { id: 'r1', x: 0, y: 0 }, { userId: ME });
    expect(addElement(runtime.doc, el, runtime.writeContext()).ok).toBe(true);
    expect(runtime.history.canUndo()).toBe(true);
    runtime.history.undo();
    expect(runtime.doc.getMap('elements').size).toBe(0);
  });

  it('awareness người khác đổi → host.onPeers (gộp ≤ 30 Hz), không gồm chính mình', async () => {
    const { host, ports, runtime } = setup();
    await runtime.start();
    const port = ports.last();
    port.options.handlers.onAwarenessChange();
    port.awareness.setLocalState({ user: { color: '#175CD3', id: ME, name: 'An' } });
    await flush();
    expect(host.onPeers).toHaveBeenCalledTimes(1);
    expect(host.onPeers).toHaveBeenCalledWith([]);
  });

  it('xin token lượt đầu lỗi 404 → FORBIDDEN nghiêm trọng (mất quyền), KHÔNG mở phiên', async () => {
    const { host, ports, runtime } = setup(jest.fn().mockRejectedValue(new Error('404')));
    await runtime.start();
    expect(host.onFailure).toHaveBeenCalledWith({ code: 'FORBIDDEN', fatal: true });
    expect(ports.ports).toHaveLength(0);
  });

  it('xin token lượt đầu lỗi mạng → TOKEN_FAILED không nghiêm trọng; retry() bắt đầu lại từ đầu', async () => {
    const fetchGrant = jest.fn().mockRejectedValueOnce(new Error('mạng')).mockResolvedValue(makeGrant());
    const { host, ports, runtime } = setup(fetchGrant);
    await runtime.start();
    expect(host.onFailure).toHaveBeenCalledWith({ code: 'TOKEN_FAILED', fatal: false });
    runtime.retry();
    await flush();
    expect(ports.ports).toHaveLength(1);
  });

  it('stop(): huỷ phiên, ngừng làm mới token và không nối lại; start() sau stop() chạy lại được (StrictMode)', async () => {
    const { ports, runtime } = setup();
    await runtime.start();
    runtime.stop();
    expect(ports.last().destroy).toHaveBeenCalledTimes(1);
    expect(runtime.publisher).toBeNull();
    await jest.advanceTimersByTimeAsync(600_000);
    expect(ports.ports).toHaveLength(1);
    await runtime.start();
    expect(ports.ports).toHaveLength(2);
  });

  it('stop() giữa lúc còn chờ token: kết quả về muộn KHÔNG mở phiên ma', async () => {
    let resolve: (grant: ReturnType<typeof makeGrant>) => void = () => undefined;
    const { ports, runtime } = setup(jest.fn(() => new Promise((r) => (resolve = r))));
    const started = runtime.start();
    runtime.stop();
    resolve(makeGrant());
    await started;
    expect(ports.ports).toHaveLength(0);
  });

  it('token được làm mới TRƯỚC hạn (CW-D5): hẹn giờ expiresAt − 60 s gọi lại collab-token', async () => {
    // Mỗi lượt xin trả token sống thêm 5 phút TÍNH TỪ LÚC XIN (như BE thật) — trả cùng một `expiresAt` cố định là mô phỏng sai.
    const fetchGrant = jest.fn(async () => makeGrant({ expiresAt: Date.now() + 300_000 }));
    const { host, runtime } = setup(fetchGrant);
    await runtime.start();
    expect(fetchGrant).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(239_000);
    expect(fetchGrant).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(2_000);
    expect(fetchGrant).toHaveBeenCalledTimes(2);
    expect(host.onGranted).toHaveBeenCalledTimes(2);
  });

  it('app trở lại nền trước → kiểm lại hạn token (bộ hẹn giờ bị đóng băng ở nền)', async () => {
    const listeners: ((state: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (s: string) => void) => {
      listeners.push(fn);
      return { remove: jest.fn() };
    }) as never);
    const { runtime } = setup();
    await runtime.start();
    expect(listeners).toHaveLength(1);
    expect(() => listeners[0]?.('active')).not.toThrow();
  });
});

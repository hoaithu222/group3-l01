import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
} from '@hocuspocus/provider';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';

import { installAwarenessFilter } from '../collab/awareness-filter';

/**
 * BẮT BUỘC (`collab/README.md` §3.3): `HocuspocusProvider` 3.4.4 phản hồi lại MỌI awareness của người khác ⇒ 20–30 client bị đóng `rate-limited`. Test dùng
 * provider THẬT (không mở socket: `autoConnect: false`, không gọi `connect`) và đếm số tin `send` — không mock `awarenessUpdateHandler`, vì mock là
 * kiểm chính cái mock. Ca đối chứng (không gắn bộ lọc) chứng minh test THẬT SỰ bắt được lỗi, không xanh giả.
 */
const sockets: HocuspocusProviderWebsocket[] = [];
function makeProvider(): HocuspocusProvider {
  const socket = new HocuspocusProviderWebsocket({ autoConnect: false, url: 'ws://localhost:1/collab' });
  sockets.push(socket);
  const provider = new HocuspocusProvider({
    document: new Y.Doc(),
    name: 'wb:0123456789abcdef01234567',
    websocketProvider: socket,
  });
  provider.attach();
  return provider;
}

// Socket có `setInterval` kiểm tra kết nối chạy ngay từ constructor: không huỷ thì Jest báo rò hẹn giờ.
afterEach(() => {
  while (sockets.length > 0) sockets.pop()?.destroy();
});

/** Một awareness của "người khác" với state hợp lệ; trả bản mã hoá để áp vào provider như tin từ server (origin = chính provider). */
function remoteUpdate(): Uint8Array {
  const other = new Awareness(new Y.Doc());
  other.setLocalState({ pointer: { x: 1, y: 2 }, user: { color: '#175CD3', id: 'u2', name: 'Lan' } });
  const update = encodeAwarenessUpdate(other, [other.clientID]);
  other.destroy(); // `Awareness` có `setInterval` riêng — không huỷ thì Jest báo rò hẹn giờ
  return update;
}

describe('bộ lọc phản hồi awareness', () => {
  it('ĐỐI CHỨNG: không lọc thì state của người khác bị gửi LẠI lên server (đúng lỗi 3.4.4)', () => {
    const provider = makeProvider();
    const send = jest.spyOn(provider, 'send').mockImplementation(() => undefined);
    applyAwarenessUpdate(provider.awareness as Awareness, remoteUpdate(), provider);
    expect(send).toHaveBeenCalledTimes(1);
    provider.destroy();
  });

  it('đã lọc: state người khác (origin = provider) KHÔNG bị gửi lại', () => {
    const provider = makeProvider();
    installAwarenessFilter(provider);
    const send = jest.spyOn(provider, 'send').mockImplementation(() => undefined);
    applyAwarenessUpdate(provider.awareness as Awareness, remoteUpdate(), provider);
    expect(send).not.toHaveBeenCalled();
    provider.destroy();
  });

  it('đã lọc: state của CHÍNH MÌNH (con trỏ, vùng chọn) vẫn được gửi', () => {
    const provider = makeProvider();
    installAwarenessFilter(provider);
    const send = jest.spyOn(provider, 'send').mockImplementation(() => undefined);
    (provider.awareness as Awareness).setLocalStateField('pointer', { x: 3, y: 4 });
    expect(send).toHaveBeenCalledTimes(1);
    provider.destroy();
  });

  it('gắn bộ lọc KHÔNG nhân đôi tin: mỗi thay đổi cục bộ đúng MỘT tin', () => {
    const provider = makeProvider();
    installAwarenessFilter(provider);
    const send = jest.spyOn(provider, 'send').mockImplementation(() => undefined);
    const awareness = provider.awareness as Awareness;
    awareness.setLocalStateField('pointer', { x: 1, y: 1 });
    awareness.setLocalStateField('pointer', { x: 2, y: 2 });
    expect(send).toHaveBeenCalledTimes(2);
    provider.destroy();
  });
});

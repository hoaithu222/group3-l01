import { DocEditorBridge, hostMessage } from '../webview/doc-editor-bridge';
import type { InitLivePayload } from '../webview/doc-editor-bridge.types';

/**
 * Cầu nối app → WebView: tin gửi TRƯỚC `init` được xếp hàng (editor đáp `not-initialized` nếu tới sớm), xả theo thứ tự ngay sau `init`;
 * trang nạp lại (`reset`) thì hàng đợi cũ bỏ đi; gỡ hàm gửi (rời màn) thì tin đi ra bị bỏ, không ném lỗi.
 */
const INIT: InitLivePayload = {
  documentName: 'doc:0123456789abcdef01234567',
  mode: 'edit',
  token: 'a.b.c',
  url: 'wss://x.example/collab',
  user: { color: '#175CD3', id: 'u1', name: 'Lan' },
};

const sent = (post: jest.Mock) =>
  post.mock.calls.map(
    ([json]) => JSON.parse(json as string) as { payload: unknown; type: string; v: number },
  );

describe('DocEditorBridge', () => {
  it('lệnh gửi trước init được xếp hàng; init đi trước rồi xả đúng thứ tự', () => {
    const post = jest.fn();
    const bridge = new DocEditorBridge(post);
    bridge.command({ name: 'bold' });
    bridge.command({ attrs: { level: 2 }, name: 'heading' });
    expect(post).not.toHaveBeenCalled();
    expect(bridge.isOpen).toBe(false);

    bridge.send(hostMessage('init', INIT));
    expect(bridge.isOpen).toBe(true);
    expect(sent(post).map((m) => m.type)).toEqual(['init', 'command', 'command']);
    expect(sent(post)[1]).toEqual({ payload: { name: 'bold' }, type: 'command', v: 1 });
    expect(sent(post)[2]?.payload).toEqual({ attrs: { level: 2 }, name: 'heading' });
  });

  it('sau init gửi thẳng; command kèm requestId khi được yêu cầu', () => {
    const post = jest.fn();
    const bridge = new DocEditorBridge(post);
    bridge.send(hostMessage('init', INIT));
    bridge.command({ name: 'undo' }, 'r-1');
    bridge.send(hostMessage('setToken', { expiresAt: 5, token: 'new.token.x' }));
    expect(sent(post).slice(1)).toEqual([
      { payload: { name: 'undo', requestId: 'r-1' }, type: 'command', v: 1 },
      { payload: { expiresAt: 5, token: 'new.token.x' }, type: 'setToken', v: 1 },
    ]);
  });

  it('reset() (trang nạp lại) đóng cổng và bỏ hàng đợi của phiên trước', () => {
    const post = jest.fn();
    const bridge = new DocEditorBridge(post);
    bridge.send(hostMessage('init', INIT));
    bridge.reset();
    bridge.command({ name: 'italic' });
    bridge.reset();
    bridge.send(hostMessage('init', INIT));
    expect(sent(post).map((m) => m.type)).toEqual(['init', 'init']);
  });

  it('hàng đợi có trần 30: quá thì bỏ tin cũ nhất', () => {
    const post = jest.fn();
    const bridge = new DocEditorBridge(post);
    for (let i = 0; i < 35; i += 1) bridge.command({ name: 'bold' }, `r-${i}`);
    bridge.send(hostMessage('init', INIT));
    const commands = sent(post).slice(1);
    expect(commands).toHaveLength(30);
    expect((commands[0]?.payload as { requestId: string }).requestId).toBe('r-5');
  });

  it('chưa gắn / đã gỡ hàm gửi thì tin đi ra bị bỏ, không ném lỗi', () => {
    const post = jest.fn();
    const bridge = new DocEditorBridge();
    expect(() => bridge.send(hostMessage('init', INIT))).not.toThrow();
    bridge.attach(post);
    bridge.command({ name: 'bold' });
    bridge.attach(null);
    expect(() => bridge.command({ name: 'bold' })).not.toThrow();
    expect(post).toHaveBeenCalledTimes(1);
  });
});

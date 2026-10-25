import { screen, waitFor } from '@testing-library/react-native';
import * as mockWebViewModule from 'react-native-webview';

import { resetWebViewMock, webViewMethods } from '../../../../__mocks__/react-native-webview';
import { docsCollabService } from '../api/docs-collab.service';
import { docsService } from '../api/docs.service';
import { DocumentEditorScreen } from '../screens/DocumentEditorScreen';
import {
  DOC_ID,
  fromEditor,
  makeDoc,
  makeGrant,
  posted,
  postedOfType,
  rawFromEditor,
  renderWithProviders,
} from './docs.harness';

/**
 * app.md p6-01 §4, §8 — CẦU NỐI app ↔ WebView phía APP (Jest không chạy JS trong trang, nên chỉ kiểm tin gửi đi và cách xử lý tin nhận về; phía trang test ở
 * `collab/editor-web`): trình tự `ready` → token mới → `init`, `requestToken` → `setToken`, an toàn của WebView, tin lạ bị bỏ, `dispose` khi rời màn.
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({
    docId: '0123456789abcdef01234567',
    wsId: '0123456789abcdef01234599',
  })),
}));
jest.mock('@/core/socket', () => ({
  SocketEvent: { DOCUMENT_UPDATED: 'document:updated', PERMISSION_REVOKED: 'permission:revoked' },
  useConnectionState: jest.fn(() => 'connected'),
  useSocketEvent: jest.fn(),
}));
jest.mock('../utils/load-webview-module', () => ({
  loadWebViewModule: jest.fn(async () => mockWebViewModule),
}));
jest.mock('../utils/load-editor-html', () => ({
  loadEditorHtml: jest.fn(async () => '<html><div id="editor-root"></div></html>'),
}));
jest.mock('../api/docs.service', () => ({ docsService: { detail: jest.fn() } }));
jest.mock('../api/docs-collab.service', () => ({
  docsCollabService: { assetUrl: jest.fn(), attachAsset: jest.fn(), issueToken: jest.fn() },
}));

const service = jest.mocked(docsService);
const collab = jest.mocked(docsCollabService);

async function openEditor() {
  const view = await renderWithProviders(<DocumentEditorScreen />);
  await screen.findByTestId('webview');
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetWebViewMock();
  service.detail.mockResolvedValue(makeDoc());
  collab.issueToken.mockResolvedValue(makeGrant());
});

describe('WebView an toàn', () => {
  it('nạp HTML tại chỗ, khoá chặt, không inject JS, chặn điều hướng lạ', async () => {
    await openEditor();
    const props = screen.getByTestId('webview').props as Record<string, unknown>;
    expect(props['source']).toEqual({ html: '<html><div id="editor-root"></div></html>' });
    expect(props['originWhitelist']).toEqual(['about:blank']);
    expect(props['javaScriptEnabled']).toBe(true);
    expect(props['allowFileAccess']).toBe(false);
    expect(props['allowUniversalAccessFromFileURLs']).toBe(false);
    expect(props['setSupportMultipleWindows']).toBe(false);
    expect(props['mixedContentMode']).toBe('never');
    expect(props['incognito']).toBe(true);
    expect(props['injectedJavaScript']).toBeUndefined();
    const allow = props['onShouldStartLoadWithRequest'] as (request: { url: string }) => boolean;
    expect(allow({ url: 'about:blank' })).toBe(true);
    expect(allow({ url: 'https://evil.example/phish' })).toBe(false);
    expect(allow({ url: 'javascript:alert(1)' })).toBe(false);
  });
});

describe('ready → token mới → init', () => {
  it('chưa có tin nào thì chưa xin token, chưa gửi gì', async () => {
    await openEditor();
    expect(collab.issueToken).not.toHaveBeenCalled();
    expect(posted()).toEqual([]);
  });

  it('gửi init bằng postMessage (không injectJavaScript) với token, documentName, url KHÔNG kèm ?doc=', async () => {
    await openEditor();
    await fromEditor('ready', { bundle: '0.1.0', commands: [], protocol: 1 });
    await waitFor(() => expect(postedOfType('init')).toHaveLength(1));

    expect(collab.issueToken).toHaveBeenCalledWith(DOC_ID);
    const init = postedOfType('init')[0]?.payload;
    expect(init).toMatchObject({
      documentName: `doc:${DOC_ID}`,
      locale: 'vi',
      mode: 'edit',
      token: 'header.payload.signature',
      url: 'wss://superapp.example.com/collab',
      user: { id: 'u1', name: 'Nguyễn An' },
    });
    expect(String(init?.['url'])).not.toContain('?doc=');
    expect(typeof init?.['expiresAt']).toBe('number');
    expect(webViewMethods.injectJavaScript).not.toHaveBeenCalled();
  });

  it('WebView nạp lại (ready lần hai) → xin token MỚI lần nữa rồi init lại', async () => {
    collab.issueToken
      .mockResolvedValueOnce(makeGrant({ token: 'a.b.one' }))
      .mockResolvedValueOnce(makeGrant({ token: 'a.b.two' }));
    await openEditor();
    await fromEditor('ready', { bundle: '0.1.0', commands: [], protocol: 1 });
    await waitFor(() => expect(postedOfType('init')).toHaveLength(1));
    await fromEditor('ready', { bundle: '0.1.0', commands: [], protocol: 1 });
    await waitFor(() => expect(postedOfType('init')).toHaveLength(2));

    expect(collab.issueToken).toHaveBeenCalledTimes(2);
    expect(postedOfType('init').map((m) => m.payload['token'])).toEqual(['a.b.one', 'a.b.two']);
  });

  it('server chỉ cho xem (token mode view) → init mode view dù BE nói được sửa', async () => {
    collab.issueToken.mockResolvedValue(makeGrant({ mode: 'view' }));
    await openEditor();
    await fromEditor('ready', { bundle: '0.1.0', commands: [], protocol: 1 });
    await waitFor(() => expect(postedOfType('init')).toHaveLength(1));
    expect(postedOfType('init')[0]?.payload['mode']).toBe('view');
  });
});

describe('requestToken (CW-D5)', () => {
  it('bridge báo hết hạn/bị từ chối → xin token mới rồi gửi setToken', async () => {
    await openEditor();
    await fromEditor('ready', { bundle: '0.1.0', commands: [], protocol: 1 });
    await waitFor(() => expect(postedOfType('init')).toHaveLength(1));
    collab.issueToken.mockResolvedValueOnce(makeGrant({ token: 'moi.token.x' }));

    await fromEditor('requestToken', { attempt: 1, reason: 'expired' });
    await waitFor(() => expect(postedOfType('setToken')).toHaveLength(1));
    expect(postedOfType('setToken')[0]?.payload).toMatchObject({ token: 'moi.token.x' });
    expect(collab.issueToken).toHaveBeenCalledTimes(2);
  });

  it('quá 3 lượt liên tiếp là tin lạ → không dồn thêm vào BE (giới hạn 30 lần/phút)', async () => {
    await openEditor();
    await fromEditor('ready', { bundle: '0.1.0', commands: [], protocol: 1 });
    await waitFor(() => expect(postedOfType('init')).toHaveLength(1));
    await fromEditor('requestToken', { attempt: 9, reason: 'unauthorized' });
    expect(collab.issueToken).toHaveBeenCalledTimes(1);
  });
});

describe('biên không tin cậy', () => {
  it('tin JSON hỏng / loại lạ / sai kiểu bị bỏ, màn không sập và không gửi gì đi', async () => {
    // Tin sai chỉ được log LÝ DO (không log nội dung — có thể chứa văn bản người dùng).
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await openEditor();
    await rawFromEditor('{"v":1,"type":"sta');
    await rawFromEditor(JSON.stringify({ payload: { code: 'x' }, type: 'exec', v: 1 }));
    await rawFromEditor(
      JSON.stringify({ payload: { url: 'javascript:alert(1)' }, type: 'openLink', v: 1 }),
    );
    await rawFromEditor(JSON.stringify({ payload: {}, type: 'notice', v: 2 }));
    expect(screen.getByTestId('webview')).toBeOnTheScreen();
    expect(posted()).toEqual([]);
    expect(collab.issueToken).not.toHaveBeenCalled();
    // Chỉ log lý do + loại tin, KHÔNG log nội dung (URL độc hại không xuất hiện trong log).
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('malformed-json');
    expect(logged).not.toContain('alert(1)');
    warn.mockRestore();
  });

  it('ready sai giao thức (bundle lệch phiên bản) → báo lệch, KHÔNG init', async () => {
    await openEditor();
    await fromEditor('ready', { bundle: '9', commands: [], protocol: 2 });
    expect(await screen.findByText('Chưa mở được trình soạn thảo')).toBeOnTheScreen();
    expect(postedOfType('init')).toHaveLength(0);
  });
});

it('rời màn hình → gửi dispose để trang đóng provider gọn', async () => {
  const view = await openEditor();
  await fromEditor('ready', { bundle: '0.1.0', commands: [], protocol: 1 });
  await waitFor(() => expect(postedOfType('init')).toHaveLength(1));
  await view.unmount();
  expect(posted().at(-1)?.type).toBe('dispose');
});

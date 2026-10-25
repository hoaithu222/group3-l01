import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import * as mockWebViewModule from 'react-native-webview';

import { resetWebViewMock } from '../../../../__mocks__/react-native-webview';
import { pickImages } from '@/core/media/pick-media';
import { useUploadStore } from '@/core/uploads/upload.store';
import { docsCollabService } from '../api/docs-collab.service';
import { docsService } from '../api/docs.service';
import { DocumentEditorScreen } from '../screens/DocumentEditorScreen';
import {
  apiError,
  DOC_ID,
  fromEditor,
  makeDoc,
  makeGrant,
  postedOfType,
  renderWithProviders,
  WS_ID,
} from './docs.harness';

/**
 * app.md p6-01 §4 (ảnh chỉ qua assetId, liên kết hỏi rồi mới mở): `openLink` → hộp xác nhận rồi mới mở bằng trình duyệt; `resolveAssetUrl` → URL ký (404 → not-found); ảnh: chọn →
 * upload scope DOC kèm workspaceId → READY → gắn vào tài liệu → `insertImage { assetId }` (không bao giờ URL).
 * ⚠️ `react-native-webview` phải được import TRƯỚC file mock theo đường dẫn (xem `DocumentEditorScreen.toolbar.test.tsx`).
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
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('@/core/media/pick-media', () => ({ pickImages: jest.fn() }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../utils/load-webview-module', () => ({
  loadWebViewModule: jest.fn(async () => mockWebViewModule),
}));
jest.mock('../utils/load-editor-html', () => ({
  loadEditorHtml: jest.fn(async () => '<div id="editor-root"></div>'),
}));
jest.mock('../api/docs.service', () => ({ docsService: { detail: jest.fn() } }));
jest.mock('../api/docs-collab.service', () => ({
  docsCollabService: { assetUrl: jest.fn(), attachAsset: jest.fn(), issueToken: jest.fn() },
}));

const READY = { bundle: '0.1.0', commands: [], protocol: 1 };
const collab = jest.mocked(docsCollabService);
const ASSET = 'a1b2c3d4e5f6a1b2c3d4e5f6';

async function openReady() {
  await renderWithProviders(<DocumentEditorScreen />);
  await screen.findByTestId('webview');
  await fromEditor('ready', READY);
  await waitFor(() => expect(postedOfType('init')).toHaveLength(1));
}

beforeEach(() => {
  jest.clearAllMocks();
  resetWebViewMock();
  useUploadStore.getState().clear();
  jest.mocked(docsService.detail).mockResolvedValue(makeDoc());
  collab.issueToken.mockResolvedValue(makeGrant());
});

describe('liên kết và ảnh', () => {
  it('openLink → hỏi trước; Huỷ không mở, "Mở liên kết" mở bằng trình duyệt', async () => {
    await openReady();
    await fromEditor('openLink', { url: 'https://example.com/a' });
    expect(await screen.findByText('Mở liên kết bên ngoài?')).toBeOnTheScreen();
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Mở liên kết'));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://example.com/a');
  });

  it('resolveAssetUrl → assetUrl kèm URL ký; 404 → error not-found', async () => {
    await openReady();
    collab.assetUrl.mockResolvedValueOnce({
      expiresAt: '2026-09-27T10:00:00.000Z',
      url: 'https://cdn.example/x.png?sig=1',
    });
    await fromEditor('resolveAssetUrl', { assetId: ASSET });
    await waitFor(() => expect(postedOfType('assetUrl')).toHaveLength(1));
    expect(postedOfType('assetUrl')[0]?.payload).toMatchObject({
      assetId: ASSET,
      url: 'https://cdn.example/x.png?sig=1',
    });

    collab.assetUrl.mockRejectedValueOnce(apiError(404, 'ASSET_404'));
    await fromEditor('resolveAssetUrl', { assetId: 'b1b2c3d4e5f6a1b2c3d4e5f6' });
    await waitFor(() => expect(postedOfType('assetUrl')).toHaveLength(2));
    expect(postedOfType('assetUrl')[1]?.payload).toMatchObject({ error: 'not-found' });
  });

  it('ảnh: chọn → upload scope DOC kèm workspaceId → READY → gắn vào tài liệu → insertImage chỉ mang assetId', async () => {
    await openReady();
    jest
      .mocked(pickImages)
      .mockResolvedValue([
        { kind: 'IMAGE', mime: 'image/png', name: 'a.png', size: 1000, uri: 'file:///a.png' },
      ]);
    collab.attachAsset.mockResolvedValue(undefined);

    await fromEditor('requestImage', { requestId: 'img-1', source: 'paste' });
    await waitFor(() => expect(Object.values(useUploadStore.getState().items)).toHaveLength(1));
    const item = Object.values(useUploadStore.getState().items)[0];
    expect(item).toMatchObject({
      scope: 'DOC',
      scopeKey: DOC_ID,
      workspaceId: WS_ID,
      status: 'queued',
    });

    await act(async () => {
      useUploadStore
        .getState()
        .updateItem(item?.localId ?? '', { assetId: ASSET, status: 'ready' });
    });
    await waitFor(() => expect(postedOfType('insertImage')).toHaveLength(1));
    expect(collab.attachAsset).toHaveBeenCalledWith(DOC_ID, ASSET);
    expect(postedOfType('insertImage')[0]?.payload).toEqual({ assetId: ASSET });
  });
});

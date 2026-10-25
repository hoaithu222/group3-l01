import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as mockWebViewModule from 'react-native-webview';

import { resetWebViewMock } from '../../../../__mocks__/react-native-webview';
import { useSocketEvent } from '@/core/socket';
import { showToast } from '@/shared/utils/toast.utils';
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
} from './docs.harness';

/**
 * app.md p6-01 §3 (Lỗi · Mất quyền), §8: phiên soạn thảo — mất quyền → thoát trung tính, thông báo server (`notice`), token lỗi, thiếu module WebView, `AUTH_EXPIRED` → Thử lại.
 * Liên kết/ảnh: `DocumentEditorScreen.media.test.tsx`.
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

async function openReady() {
  await renderWithProviders(<DocumentEditorScreen />);
  await screen.findByTestId('webview');
  await fromEditor('ready', READY);
  await waitFor(() => expect(postedOfType('init')).toHaveLength(1));
}

beforeEach(() => {
  jest.clearAllMocks();
  resetWebViewMock();
  jest.mocked(docsService.detail).mockResolvedValue(makeDoc());
  collab.issueToken.mockResolvedValue(makeGrant());
});

describe('mất quyền', () => {
  it('bridge báo FORBIDDEN nghiêm trọng → thông báo trung tính rồi thoát', async () => {
    await openReady();
    await fromEditor('error', { code: 'FORBIDDEN', fatal: true });
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(showToast).toHaveBeenCalledWith('info', 'Bạn không còn quyền truy cập tài liệu này.');
  });

  it('permission:revoked của CHÍNH tài liệu → thoát; của tài liệu khác → ở lại', async () => {
    await openReady();
    const handler = jest
      .mocked(useSocketEvent)
      .mock.calls.find(([event]) => event === 'permission:revoked')?.[1] as (p: unknown) => void;
    await act(async () => handler({ scopeId: 'khac', scopeType: 'DOCUMENT' }));
    expect(router.back).not.toHaveBeenCalled();
    await act(async () => handler({ scopeId: DOC_ID, scopeType: 'DOCUMENT' }));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it('xin token gặp 404 (mất quyền) → thông báo trung tính rồi thoát', async () => {
    collab.issueToken.mockRejectedValue(apiError(404, 'RES_001'));
    await renderWithProviders(<DocumentEditorScreen />);
    await screen.findByTestId('webview');
    await fromEditor('ready', READY);
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    expect(showToast).toHaveBeenCalledWith('info', 'Bạn không còn quyền truy cập tài liệu này.');
  });

  it('xin token gặp lỗi MẠNG → chỉ cảnh báo phiên, KHÔNG thoát (mất sóng ≠ mất quyền)', async () => {
    collab.issueToken.mockRejectedValue(new Error('Network Error'));
    await renderWithProviders(<DocumentEditorScreen />);
    await screen.findByTestId('webview');
    await fromEditor('ready', READY);
    expect(await screen.findByText(/Chưa làm mới được phiên soạn thảo/)).toBeOnTheScreen();
    expect(router.back).not.toHaveBeenCalled();
  });
});

describe('thông báo và lỗi từ trang', () => {
  it('RESTORED → toast; SAVE_FAILED → KHÔNG toast (đã có chấm trạng thái)', async () => {
    await openReady();
    await fromEditor('notice', { code: 'SAVE_FAILED' });
    expect(showToast).not.toHaveBeenCalled();
    await fromEditor('notice', { code: 'RESTORED' });
    expect(showToast).toHaveBeenCalledWith(
      'info',
      'Tài liệu vừa được khôi phục về một phiên bản cũ.',
    );
  });

  it('AUTH_EXPIRED → khối "Mất phiên soạn thảo"; Thử lại xin token mới, setToken rồi retry', async () => {
    await openReady();
    await fromEditor('error', { code: 'AUTH_EXPIRED', fatal: false });
    await fireEvent.press(await screen.findByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(postedOfType('retry')).toHaveLength(1));
    expect(postedOfType('setToken')).toHaveLength(1);
    expect(collab.issueToken).toHaveBeenCalledTimes(2);
  });

  it('thiếu module WebView (dev client chưa build lại) → "Chưa hỗ trợ soạn thảo", không sập', async () => {
    const { loadWebViewModule } = jest.requireMock('../utils/load-webview-module') as {
      loadWebViewModule: jest.Mock;
    };
    loadWebViewModule.mockResolvedValueOnce(null);
    await renderWithProviders(<DocumentEditorScreen />);
    expect(await screen.findByText('Chưa hỗ trợ soạn thảo')).toBeOnTheScreen();
  });
});

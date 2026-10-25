import { screen, waitFor } from '@testing-library/react-native';
import * as mockWebViewModule from 'react-native-webview';

import { resetWebViewMock } from '../../../../__mocks__/react-native-webview';
import { docsCollabService } from '../api/docs-collab.service';
import { docsService } from '../api/docs.service';
import { DocumentEditorScreen } from '../screens/DocumentEditorScreen';
import { fromEditor, makeDoc, makeGrant, postedOfType, renderWithProviders } from './docs.harness';

/**
 * CW-D5 (README §8): "Token collab hết hạn giữa phiên → client xin token mới trước hạn 60 s, không rớt phiên". Ở mức màn hình: token vừa gửi cho trang mà chỉ còn ~61 s thì bộ hẹn giờ
 * xin token MỚI sau ~1 s (sàn `MIN_REFRESH_DELAY_MS`) và gửi `setToken` cho trang — không cần bridge phải hỏi. (Hẹn giờ chính xác `expiresAt − 60 s` + thử lại có backoff: `tests/shared/collab-token.test.ts`.)
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

const collab = jest.mocked(docsCollabService);

beforeEach(() => {
  jest.clearAllMocks();
  resetWebViewMock();
  jest.mocked(docsService.detail).mockResolvedValue(makeDoc());
});

it('token sắp hết hạn → app tự xin token mới và gửi setToken (không đợi bridge hỏi)', async () => {
  collab.issueToken
    .mockResolvedValueOnce(makeGrant({ expiresAt: Date.now() + 61_000, token: 'a.b.cu' }))
    .mockResolvedValueOnce(makeGrant({ expiresAt: Date.now() + 600_000, token: 'a.b.moi' }));
  await renderWithProviders(<DocumentEditorScreen />);
  await screen.findByTestId('webview');
  await fromEditor('ready', { bundle: '0.1.0', commands: [], protocol: 1 });
  await waitFor(() => expect(postedOfType('init')).toHaveLength(1));
  expect(postedOfType('init')[0]?.payload['token']).toBe('a.b.cu');
  expect(postedOfType('setToken')).toHaveLength(0);

  await waitFor(() => expect(postedOfType('setToken')).toHaveLength(1), { timeout: 4000 });
  expect(postedOfType('setToken')[0]?.payload).toMatchObject({ token: 'a.b.moi' });
  expect(collab.issueToken).toHaveBeenCalledTimes(2);
});

it('rời màn hình → dừng hẹn giờ: không xin token nữa', async () => {
  collab.issueToken.mockResolvedValue(
    makeGrant({ expiresAt: Date.now() + 61_000, token: 'a.b.cu' }),
  );
  const view = await renderWithProviders(<DocumentEditorScreen />);
  await screen.findByTestId('webview');
  await fromEditor('ready', { bundle: '0.1.0', commands: [], protocol: 1 });
  await waitFor(() => expect(postedOfType('init')).toHaveLength(1));
  await view.unmount();

  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(collab.issueToken).toHaveBeenCalledTimes(1);
});

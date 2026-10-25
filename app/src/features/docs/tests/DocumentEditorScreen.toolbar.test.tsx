import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as mockWebViewModule from 'react-native-webview';

import { resetWebViewMock } from '../../../../__mocks__/react-native-webview';
import { docsCollabService } from '../api/docs-collab.service';
import { docsService } from '../api/docs.service';
import { DocumentEditorScreen } from '../screens/DocumentEditorScreen';
import {
  fromEditor,
  makeDoc,
  makeGrant,
  postedOfType,
  renderWithProviders,
  SELECTION,
  STATUS_OK,
} from './docs.harness';

/**
 * app.md p6-01 §3 dòng "Editor"/"Viewer", §7: dải trạng thái (Đã lưu/Đang đồng bộ…/Mất kết nối/Chưa lưu được), toolbar native điều khiển editor qua bridge
 * (ẩn khi chỉ xem, trạng thái bằng `accessibilityState` chứ không chỉ màu), nút "Sửa", chèn liên kết an toàn.
 * ⚠️ Thứ tự import: PHẢI nạp `react-native-webview` (mock toàn cục) TRƯỚC file mock theo đường dẫn — ngược lại WebView giả không dựng phần tử nào.
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

const READY = { bundle: '0.1.0', commands: [], protocol: 1 };

/** Mở editor, để trang báo ready + init, rồi đẩy `status` + `selectionState` như trang thật. */
async function openReady(
  status: Record<string, unknown> = {},
  selection: Record<string, unknown> = {},
) {
  await renderWithProviders(<DocumentEditorScreen />);
  await screen.findByTestId('webview');
  await fromEditor('ready', READY);
  await waitFor(() => expect(postedOfType('init')).toHaveLength(1));
  await fromEditor('status', { ...STATUS_OK, ...status });
  await fromEditor('selectionState', { ...SELECTION, ...selection });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetWebViewMock();
  jest.mocked(docsService.detail).mockResolvedValue(makeDoc());
  jest.mocked(docsCollabService.issueToken).mockResolvedValue(makeGrant());
});

describe('dải trạng thái', () => {
  it.each([
    [{}, 'Đã lưu'],
    [{ unsynced: true }, 'Đang đồng bộ…'],
    [{ saveFailed: true }, 'Chưa lưu được — sẽ thử lại'],
    [{ connection: 'offline' }, 'Mất kết nối'],
  ])('status %j → "%s"', async (status, text) => {
    await openReady(status);
    expect(await screen.findByText(text)).toBeOnTheScreen();
  });

  it('ngoại tuyến → thêm banner "thay đổi sẽ đồng bộ khi có mạng"', async () => {
    await openReady({ connection: 'offline' });
    expect(await screen.findByText(/thay đổi sẽ đồng bộ khi có mạng/)).toBeOnTheScreen();
  });
});

describe('toolbar', () => {
  it('sửa được → có toolbar; bấm "Đậm" gửi lệnh bold; trạng thái bật đọc bằng accessibilityState', async () => {
    await openReady({}, { bold: true });
    const bold = await screen.findByRole('checkbox', { name: 'Đậm' });
    expect(bold).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Nghiêng' })).not.toBeChecked();

    await fireEvent.press(bold);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Tiêu đề 2' }));
    expect(postedOfType('command').map((m) => m.payload)).toEqual([
      { name: 'bold' },
      { attrs: { level: 2 }, name: 'heading' },
    ]);
  });

  it('người XEM (readOnly) → KHÔNG có toolbar, không nút "Sửa"; có banner "Chỉ xem"', async () => {
    await openReady({ mode: 'view', readOnly: true }, { canEdit: false });
    expect(await screen.findByText(/Chỉ xem — bạn không có quyền sửa/)).toBeOnTheScreen();
    expect(screen.queryByText('Đậm')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sửa' })).toBeNull();
  });

  it('chưa đồng bộ lần đầu (canEdit=false) thì chưa hiện toolbar', async () => {
    await openReady({}, { canEdit: false });
    expect(await screen.findByText('Đã lưu')).toBeOnTheScreen();
    expect(screen.queryByRole('checkbox', { name: 'Đậm' })).toBeNull();
  });

  it('"Sửa" đưa con trỏ về cuối bằng lệnh focus (không tự bật bàn phím lúc mở)', async () => {
    await openReady();
    expect(postedOfType('command')).toHaveLength(0);
    await fireEvent.press(await screen.findByRole('button', { name: 'Sửa' }));
    expect(postedOfType('command')[0]?.payload).toEqual({
      attrs: { position: 'end' },
      name: 'focus',
    });
  });
});

describe('liên kết', () => {
  it('nhập example.com → chuẩn hoá https:// rồi gửi lệnh link', async () => {
    await openReady();
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Liên kết' }));
    await fireEvent.changeText(
      await screen.findByPlaceholderText('example.com hoặc https://…'),
      'example.com',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Áp dụng' }));
    await waitFor(() => expect(postedOfType('command')).toHaveLength(1));
    expect(postedOfType('command')[0]?.payload).toEqual({
      attrs: { href: 'https://example.com' },
      name: 'link',
    });
  });

  it('javascript: bị chặn ngay trong tấm, KHÔNG gửi gì cho trang', async () => {
    await openReady();
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Liên kết' }));
    await fireEvent.changeText(
      await screen.findByPlaceholderText('example.com hoặc https://…'),
      'javascript:alert(1)',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Áp dụng' }));
    expect(await screen.findByText(/Liên kết không hợp lệ/)).toBeOnTheScreen();
    expect(postedOfType('command')).toHaveLength(0);
  });
});

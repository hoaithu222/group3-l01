import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import * as mockWebViewModule from 'react-native-webview';

import { resetWebViewMock } from '../../../../__mocks__/react-native-webview';
import { showToast } from '@/shared/utils/toast.utils';
import { docsCollabService } from '../api/docs-collab.service';
import { docsService } from '../api/docs.service';
import type { SnapshotView } from '../api/docs.types';
import { DocumentHistoryScreen } from '../screens/DocumentHistoryScreen';
import {
  apiError,
  DOC_ID,
  fromEditor,
  makeDoc,
  postedOfType,
  renderWithProviders,
  WS_ID,
} from './docs.harness';

/**
 * app.md p6-01 §3 dòng "Lịch sử", §4 (`expectedVersion`, 409), §8 CW-D4: danh sách bản lưu (loại bằng CHỮ), "Lưu phiên bản", xem chỉ đọc bằng WebView
 * (init `source: snapshot`, KHÔNG token), khôi phục có xác nhận nêu hệ quả và gửi `expectedVersion`.
 * ⚠️ `react-native-webview` phải được import TRƯỚC file mock theo đường dẫn (xem `DocumentEditorScreen.toolbar.test.tsx`).
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
jest.mock('@/core/socket', () => ({
  SocketEvent: {},
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
  docsCollabService: {
    assetUrl: jest.fn(),
    createSnapshot: jest.fn(),
    restoreSnapshot: jest.fn(),
    snapshot: jest.fn(),
    snapshots: jest.fn(),
  },
}));

const collab = jest.mocked(docsCollabService);
const SID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const snap = (over: Partial<SnapshotView> = {}): SnapshotView => ({
  at: '2026-09-27T09:00:00.000Z',
  createdBy: { id: 'u1', name: 'Nguyễn An' },
  id: SID,
  kind: 'MANUAL',
  label: 'Bản gửi thầy',
  sizeBytes: 2048,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  resetWebViewMock();
  jest.mocked(useLocalSearchParams).mockReturnValue({ docId: DOC_ID, wsId: WS_ID });
  jest.mocked(docsService.detail).mockResolvedValue(makeDoc());
  collab.snapshots.mockResolvedValue({
    items: [snap(), snap({ createdBy: null, id: 'b'.repeat(24), kind: 'AUTO', label: null })],
    nextCursor: null,
  });
  collab.snapshot.mockResolvedValue({ ...snap(), yjsState: 'AAEC', yjsVersion: 5 });
});

describe('danh sách', () => {
  it('loại bản lưu bằng CHỮ, người lưu ("Hệ thống" cho bản tự động), dung lượng', async () => {
    await renderWithProviders(<DocumentHistoryScreen />);
    expect(await screen.findByText('Thủ công')).toBeOnTheScreen();
    expect(screen.getByText('Tự động')).toBeOnTheScreen();
    expect(screen.getByText('Bản gửi thầy')).toBeOnTheScreen();
    expect(screen.getByText(/Hệ thống/)).toBeOnTheScreen();
    expect(screen.getAllByText(/2,0 KB/)).toHaveLength(2);
  });

  it('rỗng → "Chưa có phiên bản nào"; lỗi → Thử lại', async () => {
    collab.snapshots.mockResolvedValueOnce({ items: [], nextCursor: null });
    const view = await renderWithProviders(<DocumentHistoryScreen />);
    expect(await screen.findByText('Chưa có phiên bản nào')).toBeOnTheScreen();
    await view.unmount();

    collab.snapshots
      .mockRejectedValueOnce(apiError(500, 'SYS_001'))
      .mockResolvedValueOnce({ items: [snap()], nextCursor: null });
    await renderWithProviders(<DocumentHistoryScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Bản gửi thầy')).toBeOnTheScreen();
  });
});

describe('lưu phiên bản', () => {
  it('có quyền snapshot → "Lưu bản" → nhãn tuỳ chọn → gọi createSnapshot; DOC_007 hiện trong tấm', async () => {
    collab.createSnapshot
      .mockRejectedValueOnce(apiError(409, 'DOC_007'))
      .mockResolvedValueOnce(snap());
    await renderWithProviders(<DocumentHistoryScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Lưu bản' }));
    await fireEvent.changeText(
      await screen.findByPlaceholderText('Ví dụ: Bản gửi thầy duyệt'),
      'Bản nộp',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Lưu phiên bản' }));
    expect(await screen.findByText(/bản lưu thủ công tối đa/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Lưu phiên bản' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('success', 'Đã lưu phiên bản'));
    expect(collab.createSnapshot).toHaveBeenLastCalledWith(DOC_ID, 'Bản nộp');
  });

  it('người xem (không có quyền snapshot) → không có "Lưu bản"', async () => {
    jest
      .mocked(docsService.detail)
      .mockResolvedValue(
        makeDoc({ myPermissions: { edit: false, manage: false, restore: false, snapshot: false } }),
      );
    await renderWithProviders(<DocumentHistoryScreen />);
    await screen.findByText('Thủ công');
    expect(screen.queryByRole('button', { name: 'Lưu bản' })).toBeNull();
  });
});

describe('xem và khôi phục', () => {
  async function openViewer() {
    await renderWithProviders(<DocumentHistoryScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: /^Thủ công · Bản gửi thầy/ }));
    await screen.findByTestId('webview');
    await fromEditor('ready', { bundle: '0.1.0', commands: [], protocol: 1 });
    await waitFor(() => expect(postedOfType('init')).toHaveLength(1));
  }

  it('xem chỉ đọc: init source=snapshot mang yjsState, KHÔNG có token/url; có banner "phiên bản cũ"', async () => {
    await openViewer();
    expect(postedOfType('init')[0]?.payload).toEqual({
      locale: 'vi',
      source: 'snapshot',
      theme: expect.stringMatching(/light|dark/),
      yjsState: 'AAEC',
    });
    expect(collab.snapshot).toHaveBeenCalledWith(DOC_ID, SID);
    expect(screen.getByText(/phiên bản cũ — chỉ đọc/)).toBeOnTheScreen();
  });

  it('khôi phục: hộp xác nhận nêu hệ quả → gửi expectedVersion của metadata → toast', async () => {
    collab.restoreSnapshot.mockResolvedValue({
      preRestoreSnapshotId: 'p1',
      restoredVersion: 6,
      version: 4,
    });
    await openViewer();
    await fireEvent.press(screen.getByRole('button', { name: 'Khôi phục phiên bản này' }));
    expect(await screen.findByText(/mọi người đang sửa tài liệu sẽ thấy ngay/)).toBeOnTheScreen();
    expect(collab.restoreSnapshot).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Khôi phục' }));
    await waitFor(() => expect(collab.restoreSnapshot).toHaveBeenCalledWith(DOC_ID, SID, 3));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        'success',
        expect.stringMatching(/Đã khôi phục phiên bản/),
      ),
    );
  });

  it('409 RES_003 (tài liệu vừa đổi) → toast "hãy thử lại" và tải lại chi tiết', async () => {
    collab.restoreSnapshot.mockRejectedValue(apiError(409, 'RES_003'));
    await openViewer();
    await fireEvent.press(screen.getByRole('button', { name: 'Khôi phục phiên bản này' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Khôi phục' }));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('error', 'Tài liệu vừa thay đổi, hãy thử lại.'),
    );
    await waitFor(() =>
      expect(jest.mocked(docsService.detail).mock.calls.length).toBeGreaterThan(1),
    );
  });

  it('không có quyền restore → không có nút "Khôi phục phiên bản này"', async () => {
    jest
      .mocked(docsService.detail)
      .mockResolvedValue(
        makeDoc({ myPermissions: { edit: true, manage: false, restore: false, snapshot: true } }),
      );
    await openViewer();
    expect(screen.queryByRole('button', { name: 'Khôi phục phiên bản này' })).toBeNull();
  });
});

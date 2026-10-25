import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';
import { docsService } from '../api/docs.service';
import { DocumentListScreen } from '../screens/DocumentListScreen';
import { apiError, DOC_ID, makeDoc, makeDocView, renderWithProviders, WS_ID } from './docs.harness';

/**
 * app.md p6-01 §3 (Danh sách: tạo/đổi tên/lưu trữ/khôi phục) + §4: tạo có `Idempotency-Key`, lỗi `DOC_001` hiện TRONG tấm, mở thẳng tài liệu vừa tạo;
 * menu "⋯" chỉ hiện thao tác quản lý cho người có quyền; lưu trữ hỏi xác nhận; đổi tên gửi `expectedVersion`.
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
jest.mock('@/core/socket', () => ({
  SocketEvent: { DOCUMENT_UPDATED: 'document:updated' },
  useConnectionState: jest.fn(() => 'connected'),
  useSocketEvent: jest.fn(),
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/docs.service', () => ({
  docsService: {
    archive: jest.fn(),
    create: jest.fn(),
    list: jest.fn(),
    unarchive: jest.fn(),
    update: jest.fn(),
    workspaceAccess: jest.fn(),
  },
}));

const service = jest.mocked(docsService);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({ wsId: WS_ID });
  service.workspaceAccess.mockResolvedValue({
    canCreate: true,
    myRole: 'MEMBER',
    status: 'ACTIVE',
  });
  service.list.mockResolvedValue({ items: [makeDocView()], nextCursor: null });
});

async function openCreateSheet() {
  await renderWithProviders(<DocumentListScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Tạo tài liệu' }));
  return screen.findByPlaceholderText('Ví dụ: Báo cáo tuần 3');
}

describe('tạo tài liệu', () => {
  it('nhập tiêu đề → tạo kèm Idempotency-Key, mặc định "Mọi người trong nhóm", mở thẳng tài liệu mới', async () => {
    service.create.mockResolvedValue(makeDoc({ id: 'moi1' }));
    const input = await openCreateSheet();
    await fireEvent.changeText(input, '  Báo cáo mới  ');
    await fireEvent.press(screen.getAllByRole('button', { name: 'Tạo tài liệu' }).at(0) as never);

    await waitFor(() => expect(service.create).toHaveBeenCalledTimes(1));
    const [wsId, payload, key] = service.create.mock.calls[0] ?? [];
    expect(wsId).toBe(WS_ID);
    expect(payload).toEqual({ title: 'Báo cáo mới', visibility: 'WORKSPACE' });
    expect(String(key)).toMatch(/^doc-create-/);
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        params: { docId: 'moi1', wsId: WS_ID },
        pathname: '/workspaces/[wsId]/docs/[docId]',
      }),
    );
  });

  it('chọn "Chỉ người được mời" → visibility PRIVATE', async () => {
    service.create.mockResolvedValue(makeDoc({ id: 'moi2' }));
    const input = await openCreateSheet();
    await fireEvent.changeText(input, 'Tài liệu riêng');
    await fireEvent.press(screen.getByRole('radio', { name: 'Chỉ người được mời' }));
    await fireEvent.press(screen.getAllByRole('button', { name: 'Tạo tài liệu' }).at(0) as never);
    await waitFor(() => expect(service.create).toHaveBeenCalled());
    expect(service.create.mock.calls[0]?.[1]).toEqual({
      title: 'Tài liệu riêng',
      visibility: 'PRIVATE',
    });
  });

  it('tiêu đề trống → báo lỗi tại ô, KHÔNG gọi server', async () => {
    await openCreateSheet();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Tạo tài liệu' }).at(0) as never);
    expect(await screen.findByText('Nhập tiêu đề tài liệu')).toBeOnTheScreen();
    expect(service.create).not.toHaveBeenCalled();
  });

  it('DOC_001 (đủ số tài liệu) hiện TRONG tấm bằng tiếng Việt, không toast, không điều hướng', async () => {
    service.create.mockRejectedValue(apiError(409, 'DOC_001'));
    const input = await openCreateSheet();
    await fireEvent.changeText(input, 'Thêm một cái');
    await fireEvent.press(screen.getAllByRole('button', { name: 'Tạo tài liệu' }).at(0) as never);
    expect(await screen.findByText(/đã đạt số tài liệu tối đa/)).toBeOnTheScreen();
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('menu "⋯"', () => {
  it('người tạo → có Đổi tên + Lưu trữ; người xem → chỉ có Chia sẻ + Lịch sử', async () => {
    service.list.mockResolvedValue({
      items: [
        makeDocView({ myRole: 'CREATOR' }),
        makeDocView({ id: 'd2', myRole: 'VIEWER', title: 'Của người khác', visibility: 'PRIVATE' }),
      ],
      nextCursor: null,
    });
    await renderWithProviders(<DocumentListScreen />);
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Tuỳ chọn cho Báo cáo tuần 3' }),
    );
    expect(await screen.findByText('Đổi tên')).toBeOnTheScreen();
    expect(screen.getByText('Lịch sử phiên bản')).toBeOnTheScreen();
    // 'Lưu trữ' xuất hiện HAI lần: tab của danh sách + dòng trong menu.
    expect(screen.getAllByText('Lưu trữ')).toHaveLength(2);
  });

  it('người xem không thấy thao tác quản lý', async () => {
    service.list.mockResolvedValue({
      items: [makeDocView({ myRole: 'VIEWER', visibility: 'PRIVATE' })],
      nextCursor: null,
    });
    await renderWithProviders(<DocumentListScreen />);
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Tuỳ chọn cho Báo cáo tuần 3' }),
    );
    expect(await screen.findByText('Chia sẻ và cộng tác viên')).toBeOnTheScreen();
    expect(screen.queryByText('Đổi tên')).toBeNull();
    // Chỉ còn tab "Lưu trữ" — không có dòng "Lưu trữ" trong menu.
    expect(screen.getAllByText('Lưu trữ')).toHaveLength(1);
  });

  it('Lưu trữ → hộp xác nhận → gọi archive đúng id → toast', async () => {
    service.archive.mockResolvedValue(makeDoc({ status: 'ARCHIVED' }));
    await renderWithProviders(<DocumentListScreen />);
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Tuỳ chọn cho Báo cáo tuần 3' }),
    );
    await screen.findByText('Lịch sử phiên bản');
    await fireEvent.press(screen.getAllByText('Lưu trữ').at(-1) as never);
    expect(await screen.findByText('Lưu trữ tài liệu?', {}, { timeout: 2000 })).toBeOnTheScreen();
    expect(service.archive).not.toHaveBeenCalled();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Lưu trữ' }).at(-1) as never);
    await waitFor(() => expect(service.archive).toHaveBeenCalledWith(DOC_ID));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('success', 'Đã lưu trữ tài liệu'));
  });

  it('Đổi tên → gửi expectedVersion của hàng; 409 RES_003 hiện câu tiếng Việt trong tấm', async () => {
    service.update.mockRejectedValue(apiError(409, 'RES_003'));
    await renderWithProviders(<DocumentListScreen />);
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Tuỳ chọn cho Báo cáo tuần 3' }),
    );
    await fireEvent.press(await screen.findByText('Đổi tên'));
    const input = await screen.findByDisplayValue('Báo cáo tuần 3');
    await fireEvent.changeText(input, 'Tên mới');
    await fireEvent.press(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() =>
      expect(service.update).toHaveBeenCalledWith(DOC_ID, { expectedVersion: 3, title: 'Tên mới' }),
    );
    expect(await screen.findByText(/vừa được thay đổi ở nơi khác/)).toBeOnTheScreen();
  });
});

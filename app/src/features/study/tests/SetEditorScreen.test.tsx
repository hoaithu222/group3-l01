import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { studyService } from '../api/study.service';
import { SetEditorScreen } from '../screens/SetEditorScreen';
import { useSetEditorStore } from '../store/set-editor.store';
import { makeChoiceItem, makeItem, makeSet } from './fixtures';
import { apiError, renderWithProviders } from './render-helpers';

/**
 * Trình soạn (app.md p4-01 §8): STUDY_001 → mục lỗi hiện "Cần sửa" và nút Lưu vẫn bật sau khi sửa; 409 → hộp thoại
 * xung đột giữ nháp (ST-25); rời khi còn thay đổi → "Bỏ thay đổi?"; lưu chỉ gửi mục ĐÃ ĐỔI kèm `expectedVersion`.
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ setId: 's1' }),
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
jest.mock('@/core/socket', () => ({ useConnectionState: () => 'connected' }));
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }) }));
jest.mock('@/shared/theme', () => ({
  ...jest.requireActual('@/shared/theme'),
  useBreakpoint: () => ({ isTablet: false, tier: 'phone', width: 375 }),
}));
jest.mock('../api/study.service', () => ({
  studyService: { get: jest.fn(), items: jest.fn(), putItems: jest.fn() },
}));

const mocked = jest.mocked(studyService);
const ITEMS = [makeItem({ id: 'i1', order: 1 }), makeChoiceItem({ id: 'i2', order: 2 })];

beforeEach(() => {
  jest.clearAllMocks();
  useSetEditorStore.getState().reset();
  mocked.get.mockResolvedValue(makeSet());
  mocked.items.mockResolvedValue({ items: ITEMS, setVersion: 3 });
});

async function openFirstItemAndEdit(text: string) {
  await fireEvent.press(await screen.findByLabelText(/^Mục 1, Thẻ ghi nhớ/));
  await fireEvent.changeText(await screen.findByDisplayValue('Thuật ngữ'), text);
}

describe('SetEditorScreen', () => {
  it('liệt kê mục; chưa sửa gì ⇒ "Đã lưu" và nút Lưu tắt', async () => {
    await renderWithProviders(<SetEditorScreen />);

    expect(await screen.findByText('1. Thuật ngữ')).toBeOnTheScreen();
    expect(screen.getByText('2. Thủ đô của Việt Nam?')).toBeOnTheScreen();
    expect(screen.getByText('Đã lưu')).toBeOnTheScreen();
  });

  it('sửa một mục ⇒ "1 thay đổi chưa lưu"; Lưu gửi ĐÚNG mục đã đổi + expectedVersion của bộ', async () => {
    mocked.putItems.mockResolvedValue({ idMap: [], itemCount: 2, version: 4 });
    await renderWithProviders(<SetEditorScreen />);
    await openFirstItemAndEdit('Thuật ngữ mới');

    await fireEvent.press(await screen.findByText('Xong'));
    expect(await screen.findByText('1 thay đổi chưa lưu')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Lưu'));

    await waitFor(() => expect(mocked.putItems).toHaveBeenCalledTimes(1));
    const [setId, payload] = mocked.putItems.mock.calls[0] ?? [];
    expect(setId).toBe('s1');
    expect(payload).toMatchObject({ delete: [], expectedVersion: 3 });
    expect(payload?.upsert).toHaveLength(1);
    expect(payload?.upsert[0]).toMatchObject({
      clientItemKey: 'i1',
      id: 'i1',
      prompt: 'Thuật ngữ mới',
    });
  });

  it('STUDY_001 ⇒ mục lỗi hiện "Cần sửa" (icon + chữ), giữ nháp, nút Lưu vẫn bấm được sau khi sửa', async () => {
    mocked.putItems.mockRejectedValueOnce(
      apiError(400, 'STUDY_001', [
        { clientItemKey: 'i1', code: 'TOO_LONG', field: 'prompt', index: 0 },
      ]),
    );
    await renderWithProviders(<SetEditorScreen />);
    await openFirstItemAndEdit('Thuật ngữ mới');
    await fireEvent.press(await screen.findByText('Xong'));

    await fireEvent.press(screen.getByText('Lưu'));

    // Nhảy tới mục lỗi đầu tiên: form hiện khung "Cần sửa mục này" kèm câu tiếng Việt của mã lỗi.
    expect(await screen.findByText('Cần sửa mục này')).toBeOnTheScreen();
    expect(screen.getByText(/Quá dài/)).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Thuật ngữ mới')).toBeOnTheScreen();

    // Sửa xong ⇒ lỗi của mục biến mất và Lưu vẫn bật (nháp còn nguyên).
    await fireEvent.changeText(screen.getByDisplayValue('Thuật ngữ mới'), 'Ngắn hơn');
    await waitFor(() => expect(screen.queryByText('Cần sửa mục này')).toBeNull());
    await fireEvent.press(screen.getByText('Xong'));
    mocked.putItems.mockResolvedValueOnce({ idMap: [], itemCount: 2, version: 4 });
    await fireEvent.press(screen.getByText('Lưu'));
    await waitFor(() => expect(mocked.putItems).toHaveBeenCalledTimes(2));
  });

  it('409 RES_003 ⇒ hộp thoại xung đột, KHÔNG mất nháp (ST-25)', async () => {
    mocked.putItems.mockRejectedValueOnce(apiError(409, 'RES_003', { currentVersion: 5 }));
    await renderWithProviders(<SetEditorScreen />);
    await openFirstItemAndEdit('Thuật ngữ mới');
    await fireEvent.press(await screen.findByText('Xong'));

    await fireEvent.press(screen.getByText('Lưu'));

    expect(await screen.findByText('Bộ học đã được sửa ở nơi khác')).toBeOnTheScreen();
    expect(screen.getByText('Giữ nháp và lưu đè')).toBeOnTheScreen();
    expect(screen.getByText('1 thay đổi chưa lưu')).toBeOnTheScreen();
  });

  it('bấm quay lại khi còn thay đổi ⇒ hỏi "Bỏ thay đổi?"; đồng ý ⇒ xoá nháp và thoát', async () => {
    await renderWithProviders(<SetEditorScreen />);
    await openFirstItemAndEdit('Thuật ngữ mới');
    await fireEvent.press(await screen.findByText('Xong'));

    await fireEvent.press(screen.getByLabelText('Quay lại'));
    expect(await screen.findByText('Bỏ thay đổi?')).toBeOnTheScreen();
    expect(router.back).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Bỏ thay đổi'));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(useSetEditorStore.getState().drafts.s1).toBeUndefined();
  });
});

describe('SetEditorScreen — nạp bộ học lỗi', () => {
  it('lỗi nạp ⇒ "Thử lại"; bấm thì gọi lại API và mở được trình soạn', async () => {
    // React Query của helper để `retry: false` nên lượt đầu lỗi ngay; lượt "Thử lại" thành công.
    mocked.get.mockRejectedValueOnce(apiError(500, 'SYS_001'));
    await renderWithProviders(<SetEditorScreen />);

    expect(await screen.findByText('Không mở được trình soạn')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('1. Thuật ngữ')).toBeOnTheScreen();
    expect(mocked.get.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { studyService } from '../api/study.service';
import { SetEditorScreen } from '../screens/SetEditorScreen';
import { useSetEditorStore } from '../store/set-editor.store';
import { makeChoiceItem, makeItem, makeSet } from './fixtures';
import { renderWithProviders } from './render-helpers';

/**
 * "Nhập CSV" (p4-01 P1 CSV/TSV): dán → XEM TRƯỚC → thêm hàng loạt vào NHÁP → Lưu MỘT lần (`PUT items { upsert[] }`,
 * be.md §14). Bộ tách dòng/ô có test thuần riêng (`csv-import.test.ts`) — ở đây kiểm luồng màn hình.
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

beforeEach(() => {
  jest.clearAllMocks();
  useSetEditorStore.getState().reset();
  mocked.get.mockResolvedValue(makeSet());
  mocked.items.mockResolvedValue({
    items: [makeItem({ id: 'i1', order: 1 }), makeChoiceItem({ id: 'i2', order: 2 })],
    setVersion: 3,
  });
  mocked.putItems.mockResolvedValue({ idMap: [], itemCount: 4, version: 4 });
});

async function openImport() {
  await fireEvent.press(await screen.findByText('Nhập CSV'));
  return screen.findByLabelText('Nội dung');
}

describe('SetEditorScreen — nhập từ văn bản', () => {
  it('xem trước số thẻ hợp lệ + dòng lỗi kèm số dòng; "Thêm N thẻ" đưa vào nháp; Lưu gửi đúng upsert theo thứ tự', async () => {
    await renderWithProviders(<SetEditorScreen />);
    const input = await openImport();

    // Chưa dán gì: nút chưa dùng được.
    expect(screen.getByRole('button', { name: 'Thêm thẻ' })).toBeDisabled();

    await fireEvent.changeText(input, 'apple\tquả táo\nbook\tquyển sách\n\tthiếu thuật ngữ');

    expect(await screen.findByText(/2 thẻ hợp lệ/)).toBeOnTheScreen();
    expect(screen.getByText('apple')).toBeOnTheScreen();
    expect(screen.getByText('quả táo')).toBeOnTheScreen();
    expect(screen.getByText('1 dòng bị bỏ qua')).toBeOnTheScreen();
    expect(screen.getByText('Dòng 3: Thiếu thuật ngữ.')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Thêm 2 thẻ'));

    // Thêm vào NHÁP (cuối danh sách), chưa gọi mạng.
    expect(await screen.findByText('3. apple')).toBeOnTheScreen();
    expect(screen.getByText('4. book')).toBeOnTheScreen();
    expect(screen.getByText('2 thay đổi chưa lưu')).toBeOnTheScreen();
    expect(mocked.putItems).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Lưu'));
    await waitFor(() => expect(mocked.putItems).toHaveBeenCalledTimes(1));
    const [setId, payload] = mocked.putItems.mock.calls[0] ?? [];
    expect(setId).toBe('s1');
    expect(payload).toMatchObject({ delete: [], expectedVersion: 3 });
    expect(payload?.upsert).toHaveLength(2);
    const [first, second] = payload?.upsert ?? [];
    expect(first).toMatchObject({
      answerText: 'quả táo',
      afterClientItemKey: 'i2',
      prompt: 'apple',
      type: 'FLASHCARD',
    });
    expect(second).toMatchObject({
      answerText: 'quyển sách',
      afterClientItemKey: first?.clientItemKey,
      prompt: 'book',
      type: 'FLASHCARD',
    });
    expect(first?.id).toBeUndefined(); // mục MỚI: không có id server
  });

  it('bộ gần đầy: chỉ thêm tới sức chứa và báo số thẻ bị bỏ', async () => {
    // `itemsPerSetMax` mặc định 500 — bộ đã có 499 mục thì chỉ còn chỗ cho 1.
    const many = Array.from({ length: 499 }, (_, i) => makeItem({ id: `m${i}`, order: i + 1, prompt: `Từ ${i}` }));
    mocked.items.mockResolvedValue({ items: many, setVersion: 3 });
    await renderWithProviders(<SetEditorScreen />);
    const input = await openImport();

    await fireEvent.changeText(input, 'a\t1\nb\t2\nc\t3');

    expect(await screen.findByText(/1 thẻ hợp lệ/)).toBeOnTheScreen();
    expect(screen.getByText(/Bộ chỉ còn chỗ cho 1 mục — 2 thẻ cuối sẽ không được thêm/)).toBeOnTheScreen();
    expect(screen.getByText('Thêm 1 thẻ')).toBeOnTheScreen();
  });
});

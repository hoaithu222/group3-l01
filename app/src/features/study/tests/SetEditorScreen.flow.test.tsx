import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { studyService } from '../api/study.service';
import { SetEditorScreen } from '../screens/SetEditorScreen';
import { useSetEditorStore } from '../store/set-editor.store';
import { makeChoiceItem, makeItem, makeSet } from './fixtures';
import { renderWithProviders } from './render-helpers';

/**
 * Luồng soạn nhanh của trình soạn: thanh tóm tắt + hàng tự mô tả + huy hiệu, "Thêm mục" ở thanh dưới, "Thêm tiếp", xoá có hỏi
 * (mục trống thì không), trạng thái rỗng hai lối, và bố cục hai cột trên tablet.
 */
const mockLayout = { isTablet: false };
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
  useBreakpoint: () => ({ isTablet: mockLayout.isTablet, tier: 'phone', width: 375 }),
}));
jest.mock('../api/study.service', () => ({
  studyService: { get: jest.fn(), items: jest.fn(), putItems: jest.fn() },
}));

const mocked = jest.mocked(studyService);
const ITEMS = [makeItem({ id: 'i1', order: 1 }), makeChoiceItem({ id: 'i2', order: 2 })];

beforeEach(() => {
  jest.clearAllMocks();
  mockLayout.isTablet = false;
  useSetEditorStore.getState().reset();
  mocked.get.mockResolvedValue(makeSet());
  mocked.items.mockResolvedValue({ items: ITEMS, setVersion: 3 });
});

describe('danh sách mục tự mô tả', () => {
  it('thanh tóm tắt đếm mục/dạng; mỗi hàng có dòng phụ (đáp án, số lựa chọn)', async () => {
    await renderWithProviders(<SetEditorScreen />);

    expect(await screen.findByText('2 mục · 2 dạng')).toBeOnTheScreen();
    expect(screen.getByText('1 thẻ ghi nhớ · 1 trắc nghiệm')).toBeOnTheScreen();
    expect(screen.getByText('→ Định nghĩa')).toBeOnTheScreen();
    expect(screen.getByText('2 lựa chọn · 1 đúng')).toBeOnTheScreen();
    expect(screen.queryByText('Đã sửa')).toBeNull();
  });

  it('sửa một mục ⇒ hàng đó có huy hiệu "Đã sửa"; mục mới thêm có "Mới" và báo "Cần sửa" vì còn trống', async () => {
    await renderWithProviders(<SetEditorScreen />);
    await fireEvent.press(await screen.findByLabelText(/^Mục 1, Thẻ ghi nhớ/));
    await fireEvent.changeText(await screen.findByDisplayValue('Thuật ngữ'), 'Từ mới');
    await fireEvent.press(await screen.findByText('Xong'));

    expect(await screen.findByText('Đã sửa')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Thêm mục'));
    await fireEvent.press(await screen.findByRole('button', { name: /^Trắc nghiệm./ }));
    await fireEvent.press(await screen.findByText('Xong'));

    expect(await screen.findByText('3 mục · 2 dạng')).toBeOnTheScreen();
    expect(screen.getByText('Mới')).toBeOnTheScreen();
    expect(screen.getByText('1 mục cần sửa')).toBeOnTheScreen();
  });
});

describe('thêm mục nhanh', () => {
  it('"Thêm mục" ở thanh dưới ⇒ chọn dạng ⇒ mở luôn form mục MỚI (trống) ở cuối danh sách', async () => {
    await renderWithProviders(<SetEditorScreen />);

    await fireEvent.press(await screen.findByText('Thêm mục'));
    await fireEvent.press(await screen.findByText('Đúng / Sai'));

    expect(await screen.findByText('Đáp án đúng')).toBeOnTheScreen();
    expect(useSetEditorStore.getState().drafts.s1?.order).toHaveLength(3);
    expect(screen.getByText('1 thay đổi chưa lưu')).toBeOnTheScreen();
    // Đang mở form ⇒ thanh dưới trên điện thoại chỉ còn Lưu (không "Thêm mục" chồng lên form).
    expect(screen.queryByText('Thêm mục')).toBeNull();
  });

  it('"Thêm tiếp" ⇒ thêm mục cùng dạng NGAY SAU mục đang sửa và mở nó', async () => {
    await renderWithProviders(<SetEditorScreen />);
    await fireEvent.press(await screen.findByLabelText(/^Mục 1, Thẻ ghi nhớ/));

    await fireEvent.press(await screen.findByLabelText('Xong và thêm mục tiếp theo'));

    await waitFor(() => expect(useSetEditorStore.getState().drafts.s1?.order).toHaveLength(3));
    const order = useSetEditorStore.getState().drafts.s1?.order ?? [];
    expect(order[0]).toBe('i1');
    expect(order[2]).toBe('i2');
    const added = useSetEditorStore.getState().drafts.s1?.items[order[1] ?? ''];
    expect(added).toMatchObject({ prompt: '', type: 'FLASHCARD' });
    expect(await screen.findByPlaceholderText('Ví dụ: environment')).toHaveDisplayValue('');
  });
});

describe('xoá mục', () => {
  it('mục ĐÃ có nội dung ⇒ hỏi lại; "Giữ lại" không xoá, "Xoá mục" xoá khỏi nháp', async () => {
    await renderWithProviders(<SetEditorScreen />);
    await fireEvent.press(await screen.findByLabelText(/^Mục 1, Thẻ ghi nhớ/));

    await fireEvent.press(await screen.findByRole('button', { name: 'Xoá mục' }));
    expect(await screen.findByText('Xoá mục này?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Giữ lại'));
    expect(useSetEditorStore.getState().drafts.s1?.order).toEqual(['i1', 'i2']);

    await fireEvent.press(screen.getByRole('button', { name: 'Xoá mục' }));
    // Hộp thoại xác nhận cũng có nút "Xoá mục" — nó nằm SAU nút của form trong cây.
    await fireEvent.press(
      (await screen.findAllByRole('button', { name: 'Xoá mục' })).at(-1) as never,
    );
    await waitFor(() => expect(useSetEditorStore.getState().drafts.s1?.order).toEqual(['i2']));
  });

  it('mục vừa thêm, chưa gõ gì ⇒ xoá NGAY, không hỏi', async () => {
    await renderWithProviders(<SetEditorScreen />);
    await fireEvent.press(await screen.findByText('Thêm mục'));
    await fireEvent.press(await screen.findByRole('button', { name: /^Thẻ ghi nhớ./ }));

    await fireEvent.press(await screen.findByRole('button', { name: 'Xoá mục' }));

    expect(screen.queryByText('Xoá mục này?')).toBeNull();
    await waitFor(() =>
      expect(useSetEditorStore.getState().drafts.s1?.order).toEqual(['i1', 'i2']),
    );
  });
});

describe('bộ chưa có mục và tablet', () => {
  it('bộ rỗng ⇒ hai lối "Nhập từ CSV" / "Thêm thủ công" + thêm nhanh theo dạng', async () => {
    mocked.items.mockResolvedValue({ items: [], setVersion: 3 });
    await renderWithProviders(<SetEditorScreen />);

    expect(await screen.findByText('Bộ chưa có mục')).toBeOnTheScreen();
    expect(screen.getByText('Nhập từ CSV')).toBeOnTheScreen();
    expect(screen.getByText('Thêm thủ công')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Thêm Trắc nghiệm'));

    await waitFor(() => expect(useSetEditorStore.getState().drafts.s1?.order).toHaveLength(1));
    expect(Object.values(useSetEditorStore.getState().drafts.s1?.items ?? {})[0]?.type).toBe(
      'MULTIPLE_CHOICE',
    );
  });

  it('tablet ⇒ danh sách và form CÙNG lúc; chưa chọn mục thì cột phải mời chọn, chọn rồi hiện form', async () => {
    mockLayout.isTablet = true;
    await renderWithProviders(<SetEditorScreen />);

    expect(await screen.findByText('1. Thuật ngữ')).toBeOnTheScreen();
    expect(screen.getByText('Chưa chọn mục nào')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText(/^Mục 1, Thẻ ghi nhớ/));

    expect(await screen.findByDisplayValue('Thuật ngữ')).toBeOnTheScreen();
    expect(screen.getByText('1. Thuật ngữ')).toBeOnTheScreen();
    expect(screen.getByText('Thêm mục')).toBeOnTheScreen();
  });
});

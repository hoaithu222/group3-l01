import { fireEvent, screen } from '@testing-library/react-native';

import { studyService } from '../api/study.service';
import { SetEditorScreen } from '../screens/SetEditorScreen';
import { useSetEditorStore } from '../store/set-editor.store';
import { makeChoiceItem, makeItem, makeSet } from './fixtures';
import { renderWithProviders } from './render-helpers';

/**
 * Các ô nhập theo dạng trong form mục: đáp án đúng bằng MỘT cú chạm (dấu tích + chữ, không chỉ màu), Enter thêm dòng kế, Đúng/Sai bằng
 * thẻ lớn, điền chỗ trống có ví dụ so khớp, đổi dạng qua tấm chọn — và bản xem trước bám nháp từng phím gõ.
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
const draftItem = (key: string) => useSetEditorStore.getState().drafts.s1?.items[key];

beforeEach(() => {
  jest.clearAllMocks();
  useSetEditorStore.getState().reset();
  mocked.get.mockResolvedValue(makeSet());
  mocked.items.mockResolvedValue({
    items: [
      makeItem({ id: 'i1', order: 1 }),
      makeChoiceItem({ id: 'i2', order: 2 }),
      makeChoiceItem({ id: 'i3', order: 3, prompt: 'Chọn số chẵn', type: 'MULTI_SELECT' }),
    ],
    setVersion: 3,
  });
});

const open = async (label: RegExp) => fireEvent.press(await screen.findByLabelText(label));

describe('trắc nghiệm — chọn đáp án đúng', () => {
  it('MỘT đáp án: vai radio, chọn cái mới thì bỏ cái cũ; đáp án đúng có chữ "Đáp án đúng"', async () => {
    await renderWithProviders(<SetEditorScreen />);
    await open(/^Mục 2, Trắc nghiệm/);

    expect(await screen.findByRole('radio', { name: 'Lựa chọn 2 là đáp án đúng' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Lựa chọn 1 là đáp án đúng' })).not.toBeChecked();
    expect(screen.getAllByText('Đáp án đúng')).toHaveLength(1);

    await fireEvent.press(screen.getByRole('radio', { name: 'Lựa chọn 1 là đáp án đúng' }));

    expect(screen.getByRole('radio', { name: 'Lựa chọn 1 là đáp án đúng' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Lựa chọn 2 là đáp án đúng' })).not.toBeChecked();
    expect(draftItem('i2')?.correctKeys).toEqual(['o_aaaaaa']);
  });

  it('NHIỀU đáp án: vai checkbox, chọn thêm không bỏ cái cũ', async () => {
    await renderWithProviders(<SetEditorScreen />);
    await open(/^Mục 3, Nhiều đáp án đúng/);

    await fireEvent.press(
      await screen.findByRole('checkbox', { name: 'Lựa chọn 1 là đáp án đúng' }),
    );

    expect(draftItem('i3')?.correctKeys).toHaveLength(2);
    expect(screen.getAllByText('Đáp án đúng')).toHaveLength(2);
  });

  it('bộ đếm "Các lựa chọn · n/6"; Enter ở lựa chọn CUỐI thêm một lựa chọn mới', async () => {
    await renderWithProviders(<SetEditorScreen />);
    await open(/^Mục 2, Trắc nghiệm/);
    expect(await screen.findByText('Các lựa chọn · 2/6')).toBeOnTheScreen();

    await fireEvent(screen.getByLabelText('Lựa chọn 2'), 'submitEditing');

    expect(await screen.findByText('Các lựa chọn · 3/6')).toBeOnTheScreen();
    expect(screen.getByLabelText('Lựa chọn 3')).toBeOnTheScreen();
  });

  it('chạm trần số lựa chọn ⇒ "Thêm lựa chọn" bị khoá', async () => {
    await renderWithProviders(<SetEditorScreen />);
    await open(/^Mục 2, Trắc nghiệm/);
    for (let count = 2; count < 6; count += 1) {
      await fireEvent.press(await screen.findByRole('button', { name: 'Thêm lựa chọn' }));
    }

    expect(await screen.findByText('Các lựa chọn · 6/6')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Thêm lựa chọn' })).toBeDisabled();
  });
});

describe('Đúng/Sai, điền chỗ trống, đổi dạng', () => {
  it('Đúng/Sai: hai thẻ lớn vai radio; chạm "Sai" ⇒ nháp correct=false', async () => {
    await renderWithProviders(<SetEditorScreen />);
    await open(/^Mục 1, Thẻ ghi nhớ/);
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Đổi dạng mục, hiện là Thẻ ghi nhớ' }),
    );
    await fireEvent.press(await screen.findByRole('radio', { name: /^Đúng \/ Sai\./ }));

    expect(await screen.findByRole('radio', { name: 'Đúng' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Sai' }));

    expect(screen.getByRole('radio', { name: 'Sai' })).toBeChecked();
    expect(draftItem('i1')).toMatchObject({ correct: false, type: 'TRUE_FALSE' });
  });

  it('điền chỗ trống: Enter ở đáp án cuối (đã gõ) thêm dòng mới; ví dụ so khớp hiện cạnh từng chế độ', async () => {
    await renderWithProviders(<SetEditorScreen />);
    await open(/^Mục 1, Thẻ ghi nhớ/);
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Đổi dạng mục, hiện là Thẻ ghi nhớ' }),
    );
    await fireEvent.press(await screen.findByRole('radio', { name: /^Điền vào chỗ trống\./ }));

    const first = await screen.findByLabelText('Đáp án chấp nhận 1');
    await fireEvent.changeText(first, 'Hà Nội');
    await fireEvent(first, 'submitEditing');

    expect(await screen.findByLabelText('Đáp án chấp nhận 2')).toBeOnTheScreen();
    expect(screen.getByText('Đáp án chấp nhận · 2/10')).toBeOnTheScreen();
    expect(screen.getByText(/Chấp nhận "ha noi"/)).toBeOnTheScreen();
  });
});

describe('bản xem trước bám nháp', () => {
  it('thẻ ghi nhớ: gõ thuật ngữ là thấy ở "Mặt trước"; chạm "Mặt sau" thấy định nghĩa', async () => {
    await renderWithProviders(<SetEditorScreen />);
    await open(/^Mục 1, Thẻ ghi nhớ/);
    await fireEvent.changeText(await screen.findByDisplayValue('Thuật ngữ'), 'Mặt trời');

    expect(screen.getByText('Mặt trời')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'Mặt sau' }));
    expect(screen.getByText('Định nghĩa')).toBeOnTheScreen();
    expect(screen.queryByText('Mặt trời')).toBeNull();
  });

  it('trắc nghiệm: "Đề bài" chưa lộ đáp án; "Đáp án" đánh dấu lựa chọn đúng bằng tích + chữ; thu gọn được', async () => {
    await renderWithProviders(<SetEditorScreen />);
    await open(/^Mục 2, Trắc nghiệm/);

    expect(await screen.findByText('Hà Nội')).toBeOnTheScreen();
    expect(screen.queryByText('Đúng')).toBeNull();

    await fireEvent.press(screen.getByRole('radio', { name: 'Đáp án' }));
    expect(screen.getByText('Đúng')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: /^Xem trước, đang mở/ }));
    expect(screen.queryByRole('radio', { name: 'Đáp án' })).toBeNull();
  });
});

import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { studyService } from '../api/study.service';
import { QuickQuizScreen } from '../screens/QuickQuizScreen';
import { makeSet } from './fixtures';
import { makeQuizItems } from './quick-quiz-fixtures';
import { renderWithProviders } from './render-helpers';

/** Quiz nhanh — màn tổng kết: điểm %, chip đúng/sai, chuỗi dài nhất, câu sai rút gọn, "Luyện lại câu sai" · "Chơi lại" · "Xong", và lời nói rõ không lưu điểm. */
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => true,
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ setId: 's1' })),
}));
jest.mock('../api/study.service', () => ({
  studyService: { get: jest.fn(), items: jest.fn(), workspaceAccess: jest.fn() },
}));

const study = jest.mocked(studyService);
const press = (name: string | RegExp, role: 'button' | 'radio' | 'switch' = 'button') =>
  fireEvent.press(screen.getByRole(role, { name }));
const choose = (label: RegExp) => press(label, 'radio');

/** Làm hết 4 câu theo thứ tự (Trộn câu tắt): ĐÚNG câu 1, SAI câu 2 (chọn "Đúng"), ĐÚNG câu 3 (điền), SAI câu 4 (chỉ chọn "Hai"). Kết quả: 2/4 = 50%. */
async function playAllFourAndReachSummary() {
  await screen.findByText('Trộn câu');
  await press('Trộn câu', 'switch');
  await press('Bắt đầu');
  await choose(/^A\. Hà Nội/);
  await press('Kiểm tra');
  await press('Câu tiếp');
  await choose(/^A\. Đúng/);
  await press('Kiểm tra');
  await press('Câu tiếp');
  await fireEvent.changeText(screen.getByLabelText('Câu trả lời'), 'ha noi');
  await press('Kiểm tra');
  await press('Câu tiếp');
  await fireEvent.press(screen.getByRole('checkbox', { name: /^B\. Hai/ }));
  await press('Kiểm tra');
  await press('Xem kết quả');
}

beforeEach(() => {
  jest.clearAllMocks();
  study.get.mockResolvedValue(makeSet());
  study.items.mockResolvedValue({ items: makeQuizItems(), setVersion: 3 });
});

describe('màn tổng kết', () => {
  it('điểm %, chip đúng/sai, chuỗi dài nhất, nhận xét và lời nói rõ KHÔNG lưu điểm', async () => {
    await renderWithProviders(<QuickQuizScreen />);
    await playAllFourAndReachSummary();

    expect(screen.getByText('Hoàn thành!')).toBeOnTheScreen();
    expect(screen.getByText('50%')).toBeOnTheScreen();
    expect(screen.getByLabelText('Điểm 50%, đúng 2 trên 4 câu')).toBeOnTheScreen();
    expect(screen.getByText('2 đúng')).toBeOnTheScreen();
    expect(screen.getByText('2 sai')).toBeOnTheScreen();
    expect(screen.getByText('Chuỗi dài nhất: 1')).toBeOnTheScreen();
    expect(screen.getByText(/Khá ổn/)).toBeOnTheScreen();
    expect(screen.getByText(/không được lưu và không cộng điểm\/XP/)).toBeOnTheScreen();
  });

  it('liệt kê CÂU SAI rút gọn: đề + đáp án đúng, theo thứ tự làm', async () => {
    await renderWithProviders(<QuickQuizScreen />);
    await playAllFourAndReachSummary();

    expect(screen.getByText('Câu cần ôn (2)')).toBeOnTheScreen();
    expect(screen.getByText('Trái đất hình vuông.')).toBeOnTheScreen();
    expect(screen.getByText('Đáp án: Sai')).toBeOnTheScreen();
    expect(screen.getByText('Chọn các số chẵn.')).toBeOnTheScreen();
    expect(screen.getByText('Đáp án: Hai / Bốn')).toBeOnTheScreen();
  });

  it('"Luyện lại 2 câu sai" chạy lại CHỈ hai câu sai (theo thứ tự khi Trộn câu tắt)', async () => {
    await renderWithProviders(<QuickQuizScreen />);
    await playAllFourAndReachSummary();

    await press('Luyện lại 2 câu sai');

    expect(screen.getByText('1 / 2')).toBeOnTheScreen();
    expect(screen.getByText('Trái đất hình vuông.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Chuỗi đúng liên tiếp: 0')).toBeOnTheScreen();
  });

  it('"Chơi lại" bắt đầu lượt mới với cùng thiết lập (câu đầu của bộ khi Trộn câu tắt)', async () => {
    await renderWithProviders(<QuickQuizScreen />);
    await playAllFourAndReachSummary();

    await press('Chơi lại');
    expect(screen.getByText('1 / 4')).toBeOnTheScreen();
    expect(screen.getByText('Thủ đô của Việt Nam là gì?')).toBeOnTheScreen();
  });

  it('"Xong" rời màn NGAY (không hỏi xác nhận vì không còn gì để mất)', async () => {
    await renderWithProviders(<QuickQuizScreen />);
    await playAllFourAndReachSummary();

    await press('Xong');

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Thoát Quiz nhanh?')).toBeNull();
  });

  it('làm đúng hết ⇒ không có "Luyện lại", không có danh sách câu sai; "Chơi lại" là hành động chính', async () => {
    await renderWithProviders(<QuickQuizScreen />);
    await screen.findByText('Trộn câu');
    await press('Trộn câu', 'switch');
    await press('Bắt đầu');
    await choose(/^A\. Hà Nội/);
    await press('Kiểm tra');
    await press('Câu tiếp');
    await choose(/^B\. Sai/);
    await press('Kiểm tra');
    await press('Câu tiếp');
    await fireEvent.changeText(screen.getByLabelText('Câu trả lời'), 'Hà Nội');
    await press('Kiểm tra');
    await press('Câu tiếp');
    await fireEvent.press(screen.getByRole('checkbox', { name: /^B\. Hai/ }));
    await fireEvent.press(screen.getByRole('checkbox', { name: /^D\. Bốn/ }));
    await press('Kiểm tra');
    await press('Xem kết quả');

    expect(screen.getByText('100%')).toBeOnTheScreen();
    expect(screen.getByText(/Xuất sắc/)).toBeOnTheScreen();
    expect(screen.getByText('Chuỗi dài nhất: 4')).toBeOnTheScreen();
    expect(screen.queryByText(/Luyện lại/)).toBeNull();
    expect(screen.queryByText(/Câu cần ôn/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Chơi lại' })).toBeOnTheScreen();
  });
});

import { fireEvent, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { studyService } from '../api/study.service';
import { QuickQuizScreen } from '../screens/QuickQuizScreen';
import { makeSet } from './fixtures';
import { makeManyChoiceItems, makeQuizItems } from './quick-quiz-fixtures';
import { renderWithProviders } from './render-helpers';

/**
 * Quiz nhanh — luồng làm bài: thiết lập (số câu, trộn) → chọn → kiểm tra → phản hồi tức thì (chữ + đáp án đúng + lời giải) → câu tiếp → chuỗi đúng → tổng kết.
 * Trạng thái dữ liệu/thoát ở `QuickQuizScreen.states.test.tsx`. Bật "Giảm chuyển động" cho `EnterView`/thanh tiến độ xác định.
 */
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => true,
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ setId: 's1' })),
}));
// Bản mock toàn cục thiếu `NotificationFeedbackType` (rung "sai") — khai đủ ở đây để kiểm đúng loại rung.
jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
}));
jest.mock('../api/study.service', () => ({
  studyService: { get: jest.fn(), items: jest.fn(), workspaceAccess: jest.fn() },
}));

const study = jest.mocked(studyService);
const press = (
  name: string | RegExp,
  role: 'button' | 'radio' | 'checkbox' | 'switch' = 'button',
) => fireEvent.press(screen.getByRole(role, { name }));

/** Bắt đầu với "Trộn câu" TẮT để thứ tự câu tất định (đúng thứ tự `order`). */
async function startInOrder() {
  await screen.findByText('Trộn câu');
  await press('Trộn câu', 'switch');
  await press('Bắt đầu');
}
/** Trả lời một câu trắc nghiệm/đúng-sai: chọn thẻ có chữ `choice` rồi bấm "Kiểm tra". */
async function answer(choice: string, role: 'radio' | 'checkbox' = 'radio') {
  await press(new RegExp(`^[A-D]\\. ${choice}`), role);
  await press('Kiểm tra');
}

beforeEach(() => {
  jest.clearAllMocks();
  study.get.mockResolvedValue(makeSet());
  study.items.mockResolvedValue({ items: makeQuizItems(), setVersion: 3 });
});

describe('thiết lập', () => {
  it('bộ ngắn: không có hàng chọn số câu, mặc định BẬT "Trộn câu", nói rõ không lưu điểm', async () => {
    await renderWithProviders(<QuickQuizScreen />);

    expect(await screen.findByText('Bộ có 4 câu chấm được — làm tất cả.')).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Trộn câu' })).toBeChecked();
    expect(screen.getByText(/không được lưu và không cộng điểm\/XP/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Bắt đầu' })).toBeOnTheScreen();
  });

  it('bộ dài: chọn mốc 10 · 20 · Tất cả; mặc định 10; chọn 20 thì lượt có 20 câu', async () => {
    study.items.mockResolvedValue({ items: makeManyChoiceItems(25), setVersion: 1 });
    await renderWithProviders(<QuickQuizScreen />);

    expect(await screen.findByRole('radio', { name: '10 câu' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Tất cả (25)' })).not.toBeChecked();
    await press('20 câu', 'radio');
    await press('Bắt đầu');

    expect(screen.getByText('1 / 20')).toBeOnTheScreen();
  });
});

describe('trộn câu', () => {
  it('BẬT (mặc định): thứ tự câu đổi MỘT lần lúc bấm "Bắt đầu" và giữ nguyên qua các lần vẽ lại', async () => {
    // Fisher–Yates với random = 0: q1 q2 q3 q4 → q2 q3 q4 q1.
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    try {
      await renderWithProviders(<QuickQuizScreen />);
      await fireEvent.press(await screen.findByRole('button', { name: 'Bắt đầu' }));

      expect(screen.getByText('Trái đất hình vuông.')).toBeOnTheScreen();
      await answer('Sai');
      await press('Câu tiếp');
      expect(screen.getByText('Thăng Long nay là thành phố nào?')).toBeOnTheScreen();
    } finally {
      random.mockRestore();
    }
  });

  it('TẮT: đúng thứ tự soạn (câu 1 là câu đầu của bộ)', async () => {
    await renderWithProviders(<QuickQuizScreen />);
    await startInOrder();

    expect(screen.getByText('Thủ đô của Việt Nam là gì?')).toBeOnTheScreen();
  });
});

describe('làm bài — phản hồi tức thì', () => {
  it('"Kiểm tra" khoá tới khi chọn; câu đúng ⇒ "Chính xác!" + lời giải + rung nhẹ; chỉ có 4 câu (bỏ thẻ ghi nhớ)', async () => {
    await renderWithProviders(<QuickQuizScreen />);
    await startInOrder();

    expect(screen.getByText('1 / 4')).toBeOnTheScreen();
    expect(screen.getByLabelText('Câu 1 trên 4')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Kiểm tra' })).toBeDisabled();

    await answer('Hà Nội');

    expect(screen.getByText('Chính xác!')).toBeOnTheScreen();
    expect(screen.getByText('Hà Nội là thủ đô từ năm 1010.')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'A. Hà Nội, đúng' })).toBeOnTheScreen();
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
    expect(screen.getByRole('button', { name: 'Câu tiếp' })).toBeOnTheScreen();
  });

  it('câu sai ⇒ "Chưa đúng" + đáp án đúng bằng chữ + rung cảnh báo; thẻ bị khoá, đáp án đúng được đánh dấu', async () => {
    await renderWithProviders(<QuickQuizScreen />);
    await startInOrder();
    await answer('Huế');

    expect(screen.getByText('Chưa đúng')).toBeOnTheScreen();
    expect(screen.getByText('Đáp án đúng: Hà Nội')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'B. Huế, sai' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'A. Hà Nội, đáp án đúng' })).toBeOnTheScreen();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('warning');
  });

  it('chuỗi đúng: tăng khi đúng liền nhau và về 0 khi sai', async () => {
    await renderWithProviders(<QuickQuizScreen />);
    await startInOrder();
    expect(screen.getByLabelText('Chuỗi đúng liên tiếp: 0')).toBeOnTheScreen();

    await answer('Hà Nội');
    expect(screen.getByLabelText('Chuỗi đúng liên tiếp: 1')).toBeOnTheScreen();
    await press('Câu tiếp');
    await answer('Sai');
    expect(screen.getByLabelText('Chuỗi đúng liên tiếp: 2')).toBeOnTheScreen();
    expect(screen.getByText('Chuỗi 2 câu đúng liên tiếp')).toBeOnTheScreen();
    await press('Câu tiếp');

    await fireEvent.changeText(screen.getByLabelText('Câu trả lời'), 'Sài Gòn');
    await press('Kiểm tra');
    expect(screen.getByLabelText('Chuỗi đúng liên tiếp: 0')).toBeOnTheScreen();
  });

  it('câu điền: chấm theo luật bỏ dấu ("ha noi" đúng); phím Xong của bàn phím cũng chấm', async () => {
    await renderWithProviders(<QuickQuizScreen />);
    await startInOrder();
    await answer('Hà Nội');
    await press('Câu tiếp');
    await answer('Sai');
    await press('Câu tiếp');

    expect(screen.getByRole('button', { name: 'Kiểm tra' })).toBeDisabled();
    const input = screen.getByLabelText('Câu trả lời');
    await fireEvent.changeText(input, ' ha  noi ');
    await fireEvent(input, 'submitEditing');

    expect(screen.getByText('Chính xác!')).toBeOnTheScreen();
  });

  it('câu nhiều đáp án: chọn thiếu một đáp án đúng ⇒ SAI, nói rõ "Đúng một phần"; câu cuối ⇒ nút "Xem kết quả"', async () => {
    await renderWithProviders(<QuickQuizScreen />);
    await startInOrder();
    for (const choice of ['Hà Nội', 'Sai']) {
      await answer(choice);
      await press('Câu tiếp');
    }
    await fireEvent.changeText(screen.getByLabelText('Câu trả lời'), 'Hà Nội');
    await press('Kiểm tra');
    await press('Câu tiếp');

    expect(screen.getByText('Chọn tất cả đáp án đúng')).toBeOnTheScreen();
    await answer('Hai', 'checkbox');

    expect(screen.getByText('Đúng một phần')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'D. Bốn, đáp án đúng' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Xem kết quả' })).toBeOnTheScreen();
  });
});

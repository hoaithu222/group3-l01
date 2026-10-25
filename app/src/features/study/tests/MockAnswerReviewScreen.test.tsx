import { fireEvent, screen } from '@testing-library/react-native';

import { mockAttemptsService } from '../api/mock-attempts.service';
import { MockAnswerReviewScreen } from '../screens/MockAnswerReviewScreen';
import { makeResult, makeResultQuestion } from './mock-fixtures';
import { renderWithProviders } from './render-helpers';

/** Xem lại đáp án (README p4-02 §3): mỗi đáp án phân biệt bằng icon + CHỮ + màu; giải thích dễ đọc; lọc "Chỉ câu sai". */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ attemptId: 'a1' })),
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
jest.mock('../api/mock-attempts.service', () => ({
  ...jest.requireActual('../api/mock-attempts.service'),
  mockAttemptsService: { get: jest.fn() },
}));

const api = jest.mocked(mockAttemptsService);

beforeEach(() => jest.clearAllMocks());

/** Đúng · Sai (chọn B, đáp án đúng A, có giải thích) · Bỏ trống. */
const questions = [
  makeResultQuestion(0),
  makeResultQuestion(1, {
    correct: false,
    explanation: 'Vì B đúng',
    myAnswer: { itemId: 'q2', optionIds: ['o_bbbbbb'], text: null },
  }),
  makeResultQuestion(2, { correct: false, myAnswer: null }),
];

describe('MockAnswerReviewScreen', () => {
  it('đếm Đúng / Sai / Bỏ trống của cả lượt bằng icon + chữ + số', async () => {
    api.get.mockResolvedValue(makeResult({}, questions));
    await renderWithProviders(<MockAnswerReviewScreen />);

    expect(await screen.findByLabelText('Đúng 1 câu')).toBeOnTheScreen();
    expect(screen.getByLabelText('Sai 1 câu')).toBeOnTheScreen();
    expect(screen.getByLabelText('Bỏ trống 1 câu')).toBeOnTheScreen();
    expect(screen.getByText('3/3 câu')).toBeOnTheScreen();
  });

  it('từng đáp án có nhãn CHỮ theo trạng thái: bạn chọn đúng / bạn chọn sai / đáp án đúng chưa chọn', async () => {
    api.get.mockResolvedValue(makeResult({}, questions));
    await renderWithProviders(<MockAnswerReviewScreen />);

    // câu 1: chọn đúng
    expect(await screen.findByLabelText('Đáp án A1. Bạn chọn · Đúng')).toBeOnTheScreen();
    expect(screen.getByLabelText('Đáp án B1')).toBeOnTheScreen(); // đáp án trơn: không nhãn
    // câu 2: chọn B (sai), đáp án đúng là A
    expect(screen.getByLabelText('Đáp án B2. Bạn chọn · Sai')).toBeOnTheScreen();
    expect(screen.getByLabelText('Đáp án A2. Đáp án đúng')).toBeOnTheScreen();
    // câu 3: bỏ trống — vẫn chỉ ra đáp án đúng
    expect(screen.getByLabelText('Đáp án A3. Đáp án đúng')).toBeOnTheScreen();
  });

  it('kết luận từng câu bằng CHỮ (Đúng / Sai / Bỏ trống) trong huy hiệu của thẻ', async () => {
    api.get.mockResolvedValue(makeResult({}, questions));
    await renderWithProviders(<MockAnswerReviewScreen />);

    expect(await screen.findByText('Câu 1')).toBeOnTheScreen();
    expect(screen.getByText('Đúng')).toBeOnTheScreen();
    expect(screen.getByText('Sai')).toBeOnTheScreen();
    expect(screen.getByText('Bỏ trống')).toBeOnTheScreen();
  });

  it('giải thích hiện trong khối riêng có tiêu đề "Giải thích"', async () => {
    api.get.mockResolvedValue(makeResult({}, questions));
    await renderWithProviders(<MockAnswerReviewScreen />);

    expect(await screen.findByText('Giải thích')).toBeOnTheScreen();
    expect(screen.getByText('Vì B đúng')).toBeOnTheScreen();
  });

  it('chip "Chỉ câu sai" lọc: bỏ câu đúng, GIỮ câu bỏ trống (chưa đúng), cập nhật "x/y câu"', async () => {
    api.get.mockResolvedValue(makeResult({}, questions));
    await renderWithProviders(<MockAnswerReviewScreen />);
    await fireEvent.press(await screen.findByText('Chỉ câu sai'));

    expect(screen.queryByLabelText('Đáp án A1. Bạn chọn · Đúng')).toBeNull();
    expect(screen.getByLabelText('Đáp án B2. Bạn chọn · Sai')).toBeOnTheScreen();
    expect(screen.getByLabelText('Đáp án A3. Đáp án đúng')).toBeOnTheScreen();
    expect(screen.getByText('2/3 câu')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Chỉ câu sai' })).toBeChecked();
  });

  it('câu điền: dòng "Bạn trả lời" + dòng "Đáp án đúng" (các đáp án chấp nhận nối bằng " / ")', async () => {
    const fill = makeResultQuestion(0, {
      acceptedAnswers: ['hà nội', 'Ha Noi'],
      correct: false,
      myAnswer: { itemId: 'q1', optionIds: [], text: 'hue' },
      options: [],
      type: 'FILL_BLANK',
    });
    api.get.mockResolvedValue(makeResult({}, [fill]));
    await renderWithProviders(<MockAnswerReviewScreen />);

    expect(await screen.findByLabelText('hue. Bạn trả lời · Sai')).toBeOnTheScreen();
    expect(screen.getByLabelText('hà nội / Ha Noi. Đáp án đúng')).toBeOnTheScreen();
  });

  it('trả lời đúng hết ⇒ lọc "Chỉ câu sai" cho màn "Không có câu sai"', async () => {
    api.get.mockResolvedValue(makeResult({}, [makeResultQuestion(0)]));
    await renderWithProviders(<MockAnswerReviewScreen />);
    await fireEvent.press(await screen.findByText('Chỉ câu sai'));

    expect(screen.getByText('Không có câu sai')).toBeOnTheScreen();
  });
});

import { act, fireEvent, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { AccessibilityInfo, Dimensions } from 'react-native';

import { useConnectionState } from '@/core/socket';

import { mockAttemptsService } from '../api/mock-attempts.service';
import { MockTestPlayerScreen } from '../screens/MockTestPlayerScreen';
import { useMockPlayerStore } from '../store/mock-player.store';
import { AUTOSAVE_DEBOUNCE_MS } from '../utils/answer-batches';
import { makeAttempt, makeInProgress, makeQuestion, makeResult } from './mock-fixtures';
import { apiError, renderWithProviders } from './render-helpers';

/**
 * Giao diện màn làm bài (thẻ đáp án, đồng hồ, tiến độ, lưới câu): trạng thái đọc được bằng trợ năng chứ không chỉ màu.
 * Hành vi lưu/nộp/hết giờ nằm ở `MockTestPlayerScreen.test.tsx`.
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ attemptId: 'a1' })),
}));
jest.mock('@/core/socket', () => ({ useConnectionState: jest.fn(() => 'connected') }));
jest.mock('../api/mock-attempts.service', () => ({
  ...jest.requireActual('../api/mock-attempts.service'),
  mockAttemptsService: {
    get: jest.fn(),
    putAnswers: jest.fn(),
    recordEvent: jest.fn(),
    submit: jest.fn(),
  },
}));

const api = jest.mocked(mockAttemptsService);
const advance = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)));
const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.mocked(useConnectionState).mockReturnValue('connected');
  useMockPlayerStore.setState({ attempts: {} });
  api.get.mockResolvedValue(makeInProgress());
  api.putAnswers.mockResolvedValue({ answeredCount: 1, serverNow: new Date().toISOString() });
  api.submit.mockResolvedValue(makeResult());
});
afterEach(() => jest.useRealTimers());

describe('thẻ đáp án', () => {
  it('câu một đáp án là nhóm radio: chọn xong `checked`, đáp án khác bỏ chọn, rung nhẹ MỘT lần', async () => {
    await renderWithProviders(<MockTestPlayerScreen />);
    const a = await screen.findByRole('radio', { name: 'A. Đáp án A1' });
    expect(a).not.toBeChecked();
    expect(screen.getByText('Chọn một đáp án')).toBeOnTheScreen();

    await fireEvent.press(a);
    expect(screen.getByRole('radio', { name: 'A. Đáp án A1' })).toBeChecked();
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole('radio', { name: 'B. Đáp án B1' }));
    expect(screen.getByRole('radio', { name: 'B. Đáp án B1' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'A. Đáp án A1' })).not.toBeChecked();
    await advance(AUTOSAVE_DEBOUNCE_MS); // dọn hàng đợi lưu để test sau không dính
  });

  it('câu nhiều đáp án là nhóm checkbox: bật/tắt từng đáp án, gợi ý đếm số đã chọn', async () => {
    api.get.mockResolvedValue(
      makeInProgress({ questions: [makeQuestion(0, { type: 'MULTI_SELECT' }), makeQuestion(1)] }),
    );
    await renderWithProviders(<MockTestPlayerScreen />);
    expect(await screen.findByText('Chọn tất cả đáp án đúng')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'A. Đáp án A1' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'B. Đáp án B1' }));
    expect(screen.getByText('Chọn tất cả đáp án đúng · Đã chọn 2')).toBeOnTheScreen();
    expect(useMockPlayerStore.getState().attempts.a1?.answers.q1?.optionIds).toEqual([
      'o_aaaaaa',
      'o_bbbbbb',
    ]);

    await fireEvent.press(screen.getByRole('checkbox', { name: 'A. Đáp án A1' }));
    expect(screen.getByRole('checkbox', { name: 'A. Đáp án A1' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'B. Đáp án B1' })).toBeChecked();
    expect(screen.getByText('Chọn tất cả đáp án đúng · Đã chọn 1')).toBeOnTheScreen();
    await advance(AUTOSAVE_DEBOUNCE_MS);
  });

  it('hết giờ: mọi đáp án bị khoá (`disabled`), không chọn thêm được', async () => {
    api.putAnswers.mockRejectedValue(apiError(409, 'MOCK_003'));
    await renderWithProviders(<MockTestPlayerScreen />);
    await fireEvent.press(await screen.findByRole('radio', { name: 'A. Đáp án A1' }));
    await advance(AUTOSAVE_DEBOUNCE_MS);

    expect(await screen.findByText('Đã hết giờ — đang lấy kết quả')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'B. Đáp án B1' })).toBeDisabled();
  });
});

describe('đồng hồ', () => {
  it('còn nhiều thời gian: chỉ hiện giờ còn lại, KHÔNG có chữ cảnh báo', async () => {
    await renderWithProviders(<MockTestPlayerScreen />);
    expect(await screen.findByLabelText(/^Thời gian còn lại (09|10):\d\d$/)).toBeOnTheScreen();
    expect(screen.queryByText(/Còn dưới/)).toBeNull();
  });

  it('dưới 5 phút: đổi tông kèm CHỮ "Còn dưới 5 phút" + đọc thông báo trợ năng một lần (chưa phải mốc 1 phút)', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    api.get.mockResolvedValue(
      makeInProgress({ attempt: makeAttempt({ expiresAt: inMinutes(4) }) }),
    );
    await renderWithProviders(<MockTestPlayerScreen />);

    expect(await screen.findByText('Còn dưới 5 phút')).toBeOnTheScreen();
    expect(
      screen.getByLabelText(/^Thời gian còn lại 0[34]:\d\d\. Còn dưới 5 phút$/),
    ).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith('Còn dưới 5 phút');
    expect(announce).not.toHaveBeenCalledWith('Còn dưới 1 phút');
    await advance(1000);
    expect(announce).toHaveBeenCalledTimes(1); // đổi giây không đọc lại
  });
});

describe('tiến độ và lưới câu', () => {
  it('máy tính bảng: ô đang xem `selected` và đổi theo Trước/Sau; nhãn ô KHÔNG đổi', async () => {
    await renderWithProviders(<MockTestPlayerScreen />);
    expect(await screen.findByLabelText('Câu 1, chưa trả lời')).toBeSelected();
    expect(screen.getByLabelText('Câu 2, chưa trả lời')).not.toBeSelected();

    await fireEvent.press(screen.getByText('Sau'));
    expect(screen.getByLabelText('Câu 2, chưa trả lời')).toBeSelected();
    expect(screen.getByLabelText('Câu 1, chưa trả lời')).not.toBeSelected();
    expect(Haptics.selectionAsync).toHaveBeenCalled(); // chuyển câu rung nhẹ
  });

  it('đánh dấu xem lại: nhãn ô nêu rõ; hộp thoại nộp bài nhắc số câu đang đánh dấu', async () => {
    await renderWithProviders(<MockTestPlayerScreen />);
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Đánh dấu xem lại' }));
    expect(screen.getByLabelText('Câu 1, chưa trả lời, đánh dấu xem lại')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Nộp bài'));
    expect(
      screen.getByText('Còn 2 câu chưa trả lời. Có 1 câu đang đánh dấu xem lại.'),
    ).toBeOnTheScreen();
  });

  it('điện thoại: thanh tiến độ là NÚT mở/đóng lưới (`expanded`), có gợi ý cho trình đọc màn hình', async () => {
    const dimensions = jest
      .spyOn(Dimensions, 'get')
      .mockReturnValue({ fontScale: 1, height: 844, scale: 2, width: 390 });
    await renderWithProviders(<MockTestPlayerScreen />);
    const button = await screen.findByRole('button', { name: 'Đã trả lời 0/2' });
    expect(button).not.toBeExpanded();
    expect(screen.queryByLabelText('Câu 2, chưa trả lời')).toBeNull();

    await fireEvent.press(button);
    expect(screen.getByRole('button', { name: 'Đã trả lời 0/2' })).toBeExpanded();
    expect(screen.getByLabelText('Câu 2, chưa trả lời')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Câu 2, chưa trả lời'));
    expect(await screen.findByText('Câu hỏi số 2?')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Câu 2, chưa trả lời')).toBeNull(); // chọn ô xong lưới tự đóng
    dimensions.mockRestore();
  });
});

describe('nhắc bước tiếp theo', () => {
  it('câu cuối: "Sau" khoá và có dòng nhắc bấm Nộp bài ở góc trên (câu khác thì không)', async () => {
    await renderWithProviders(<MockTestPlayerScreen />);
    await screen.findByText('Câu hỏi số 1?');
    expect(screen.queryByText(/Đây là câu cuối/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Sau' })).toBeEnabled();

    await fireEvent.press(screen.getByText('Sau'));
    expect(await screen.findByText(/Đây là câu cuối/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sau' })).toBeDisabled();
  });

  it('offline: banner nêu số đáp án đang chờ gửi', async () => {
    jest.mocked(useConnectionState).mockReturnValue('offline');
    await renderWithProviders(<MockTestPlayerScreen />);
    await fireEvent.press(await screen.findByText('Đáp án A1'));

    expect(await screen.findByText(/Đang chờ gửi: 1 câu./)).toBeOnTheScreen();
  });
});

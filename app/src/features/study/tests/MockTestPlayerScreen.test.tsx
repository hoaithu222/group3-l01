import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AccessibilityInfo, Dimensions } from 'react-native';

import { useConnectionState } from '@/core/socket';

import { mockAttemptsService } from '../api/mock-attempts.service';
import { MockTestPlayerScreen } from '../screens/MockTestPlayerScreen';
import { useMockPlayerStore } from '../store/mock-player.store';
import { AUTOSAVE_DEBOUNCE_MS } from '../utils/answer-batches';
import { makeAttempt, makeInProgress, makeResult } from './mock-fixtures';
import { apiError, renderWithProviders } from './render-helpers';

/** Màn làm bài (README p4-02 §8): lưu đáp án theo debounce, offline, hết giờ/`MOCK_003`, nộp kèm đáp án chờ gửi, khôi phục. */
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
const connection = jest.mocked(useConnectionState);
const RESULT_HREF = { params: { attemptId: 'a1' }, pathname: '/study/results/[attemptId]' };
const advance = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  connection.mockReturnValue('connected');
  useMockPlayerStore.setState({ attempts: {} });
  api.get.mockResolvedValue(makeInProgress());
  api.putAnswers.mockResolvedValue({ answeredCount: 1, serverNow: new Date().toISOString() });
  api.submit.mockResolvedValue(makeResult());
});
afterEach(() => jest.useRealTimers());

describe('lưu đáp án', () => {
  it('chọn đáp án → store cập nhật NGAY, PUT gọi sau debounce rồi gỡ pending', async () => {
    await renderWithProviders(<MockTestPlayerScreen />);
    await fireEvent.press(await screen.findByText('Đáp án A1'));

    expect(useMockPlayerStore.getState().attempts.a1?.pending).toEqual(['q1']);
    expect(api.putAnswers).not.toHaveBeenCalled();

    await advance(AUTOSAVE_DEBOUNCE_MS);
    expect(api.putAnswers).toHaveBeenCalledWith('a1', [{ itemId: 'q1', optionIds: ['o_aaaaaa'] }]);
    expect(useMockPlayerStore.getState().attempts.a1?.pending).toEqual([]);
  });

  it('offline → banner + KHÔNG gọi API; ô lưới có nhãn "chưa đồng bộ" (máy tính bảng: lưới luôn hiện bên phải)', async () => {
    connection.mockReturnValue('offline');
    await renderWithProviders(<MockTestPlayerScreen />);
    expect(await screen.findByText(/Đang offline/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Đáp án A1'));
    await advance(AUTOSAVE_DEBOUNCE_MS);
    expect(api.putAnswers).not.toHaveBeenCalled();

    expect(screen.getByLabelText('Câu 1, đã trả lời, chưa đồng bộ')).toBeOnTheScreen();
    expect(screen.getByLabelText('Câu 2, chưa trả lời')).toBeOnTheScreen();
    // hai cột: tiến độ chỉ để XEM (không có nút bật lưới vì lưới luôn nằm bên phải)
    expect(screen.getByText('Đã trả lời 1/2')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Đã trả lời 1/2' })).toBeNull();
  });

  it('điện thoại: lưới câu mở bằng nút "Đã trả lời x/y"', async () => {
    const dimensions = jest
      .spyOn(Dimensions, 'get')
      .mockReturnValue({ fontScale: 1, height: 844, scale: 2, width: 390 });
    await renderWithProviders(<MockTestPlayerScreen />);
    await fireEvent.press(await screen.findByText('Đáp án A1'));

    expect(screen.queryByLabelText('Câu 2, chưa trả lời')).toBeNull();
    await fireEvent.press(screen.getByText('Đã trả lời 1/2'));
    expect(screen.getByLabelText('Câu 2, chưa trả lời')).toBeOnTheScreen();
    dimensions.mockRestore();
  });

  it('mở lại lượt dở: khôi phục vị trí và đẩy lại đáp án chưa lên server', async () => {
    useMockPlayerStore.getState().saveAnswer('a1', { itemId: 'q2', optionIds: ['o_bbbbbb'] });
    useMockPlayerStore.getState().setIndex('a1', 1);
    await renderWithProviders(<MockTestPlayerScreen />);

    expect(await screen.findByText('Câu hỏi số 2?')).toBeOnTheScreen();
    await waitFor(() =>
      expect(api.putAnswers).toHaveBeenCalledWith('a1', [
        { itemId: 'q2', optionIds: ['o_bbbbbb'] },
      ]),
    );
  });
});

describe('điều khiển trên màn làm bài', () => {
  it('Trước/Sau chuyển câu (thanh đáy); "Đánh dấu xem lại" bật/tắt theo TỪNG câu', async () => {
    await renderWithProviders(<MockTestPlayerScreen />);
    await screen.findByText('Câu hỏi số 1?');
    expect(screen.getByLabelText('Câu 1, chưa trả lời')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Đánh dấu xem lại' }));
    expect(useMockPlayerStore.getState().attempts.a1?.flagged).toEqual(['q1']);
    expect(screen.getByRole('checkbox', { name: 'Đánh dấu xem lại' })).toBeChecked();

    await fireEvent.press(screen.getByText('Sau'));
    expect(await screen.findByText('Câu hỏi số 2?')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Đánh dấu xem lại' })).not.toBeChecked();

    await fireEvent.press(screen.getByText('Trước'));
    expect(await screen.findByText('Câu hỏi số 1?')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Đánh dấu xem lại' })).toBeChecked();
  });

  it('"Nộp bài" chỉ có MỘT nút (thanh tiêu đề) và bị khoá khi phiên đã kết thúc', async () => {
    api.putAnswers.mockRejectedValue(apiError(409, 'MOCK_003'));
    await renderWithProviders(<MockTestPlayerScreen />);
    await fireEvent.press(await screen.findByText('Đáp án A1'));
    expect(screen.getAllByText('Nộp bài')).toHaveLength(1);

    await advance(AUTOSAVE_DEBOUNCE_MS);
    expect(await screen.findByText('Đã hết giờ — đang lấy kết quả')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Nộp bài' })).toBeDisabled();
  });
});

describe('hết giờ và nộp bài', () => {
  it('BE trả MOCK_003 → khoá nhập, "Đã hết giờ — đang lấy kết quả", nộp và sang màn kết quả', async () => {
    api.putAnswers.mockRejectedValue(apiError(409, 'MOCK_003'));
    await renderWithProviders(<MockTestPlayerScreen />);
    await fireEvent.press(await screen.findByText('Đáp án A1'));
    await advance(AUTOSAVE_DEBOUNCE_MS);

    expect(await screen.findByText('Đã hết giờ — đang lấy kết quả')).toBeOnTheScreen();
    await advance(0);
    expect(api.submit).toHaveBeenCalledWith('a1', []);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(RESULT_HREF));
    expect(useMockPlayerStore.getState().attempts.a1).toBeUndefined();
  });

  it('đồng hồ về 0 → tự nộp; dưới 1 phút có chữ cảnh báo và đọc thông báo trợ năng', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const soon = new Date(Date.now() + 3000).toISOString();
    api.get.mockResolvedValue(makeInProgress({ attempt: makeAttempt({ expiresAt: soon }) }));
    await renderWithProviders(<MockTestPlayerScreen />);

    expect((await screen.findAllByText('Còn dưới 1 phút')).length).toBeGreaterThan(0);
    expect(announce).toHaveBeenCalledWith('Còn dưới 1 phút');
    await advance(4000);
    expect(await screen.findByText('Đã hết giờ — đang lấy kết quả')).toBeOnTheScreen();
    expect(api.submit).toHaveBeenCalledTimes(1);
  });

  it('nộp tay: gửi kèm đáp án CHƯA lưu kịp trong submit.answers, xong dọn store và sang kết quả', async () => {
    await renderWithProviders(<MockTestPlayerScreen />);
    await fireEvent.press(await screen.findByText('Đáp án B1'));
    await fireEvent.press(screen.getByText('Nộp bài'));
    expect(screen.getByText('Còn 1 câu chưa trả lời.')).toBeOnTheScreen();
    await fireEvent.press(screen.getAllByText('Nộp bài').at(-1) as never);
    await advance(0);

    expect(api.submit).toHaveBeenCalledWith('a1', [{ itemId: 'q1', optionIds: ['o_bbbbbb'] }]);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(RESULT_HREF));
    expect(useMockPlayerStore.getState().attempts.a1).toBeUndefined();
  });

  it('nộp lỗi MOCK_005 (đáp án không thuộc đề) → bỏ phần chờ gửi để "Thử lại" không lặp mãi', async () => {
    api.submit.mockRejectedValueOnce(apiError(400, 'MOCK_005'));
    await renderWithProviders(<MockTestPlayerScreen />);
    await fireEvent.press(await screen.findByText('Đáp án B1'));
    await fireEvent.press(screen.getByText('Nộp bài'));
    await fireEvent.press(screen.getAllByText('Nộp bài').at(-1) as never);
    await advance(0);

    await waitFor(() => expect(useMockPlayerStore.getState().attempts.a1?.pending).toEqual([]));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('nút Quay lại KHÔNG thoát ngay: hỏi xác nhận vì bài thi vẫn tính giờ', async () => {
    await renderWithProviders(<MockTestPlayerScreen />);
    await screen.findByText('Câu hỏi số 1?'); // đợi đề tải xong — màn tải cũng có nút Quay lại
    await fireEvent.press(screen.getByLabelText('Quay lại'));
    expect(screen.getByText(/Bài thi vẫn tính giờ khi bạn thoát/)).toBeOnTheScreen();
    expect(router.back).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Thoát'));
    expect(router.back).toHaveBeenCalled();
  });
});

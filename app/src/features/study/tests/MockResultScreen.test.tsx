import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { mockAttemptsService } from '../api/mock-attempts.service';
import { MockResultScreen } from '../screens/MockResultScreen';
import { makeResult, TAGS_3 } from './mock-fixtures';
import { renderWithProviders } from './render-helpers';

/** Kết quả thi thử (README p4-02 §3, §8): < 3 thẻ → danh sách thanh, ≥ 3 → radar; Đạt/Chưa đạt luôn có chữ. */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ attemptId: 'a1' })),
}));
// Số điểm "chạy lên" bằng requestAnimationFrame — ở đây trả thẳng số thật để test không phụ thuộc thời gian (hành vi của
// hook được kiểm riêng ở `useScoreCountUp.test.tsx`).
jest.mock('../hooks/useScoreCountUp', () => ({ useScoreCountUp: (target: number) => target }));
jest.mock('../api/mock-attempts.service', () => ({
  ...jest.requireActual('../api/mock-attempts.service'),
  mockAttemptsService: { get: jest.fn() },
}));

const api = jest.mocked(mockAttemptsService);
const RADAR = /Biểu đồ radar/;

beforeEach(() => jest.clearAllMocks());

describe('MockResultScreen', () => {
  it('dưới 3 chủ đề → chỉ TagBarList, KHÔNG có radar; "Đạt" có chữ', async () => {
    api.get.mockResolvedValue(
      makeResult({ byTag: TAGS_3.slice(0, 2), correctCount: 4, scorePct: 67, total: 6 }),
    );
    await renderWithProviders(<MockResultScreen />);

    expect(await screen.findByText('Đạt (ngưỡng 50%)')).toBeOnTheScreen();
    expect(screen.getByText('67%')).toBeOnTheScreen();
    expect(screen.getByText('toán')).toBeOnTheScreen();
    expect(screen.getByLabelText('toán: đúng 3/4, 75 phần trăm')).toBeOnTheScreen();
    expect(screen.queryByLabelText(RADAR)).toBeNull();
  });

  it('từ 3 chủ đề → radar CẠNH danh sách; nhãn tag đặc biệt đọc thành tiếng Việt', async () => {
    api.get.mockResolvedValue(makeResult({ byTag: TAGS_3 }));
    await renderWithProviders(<MockResultScreen />);

    expect(await screen.findByLabelText(RADAR)).toBeOnTheScreen();
    expect(screen.getByText('Chưa gắn thẻ')).toBeOnTheScreen(); // vẫn có danh sách chữ, radar không phải nguồn duy nhất
    expect(screen.getByLabelText(/Chưa gắn thẻ 2\/2, 100 phần trăm/)).toBeOnTheScreen();
  });

  it('Chưa đạt có chữ (không chỉ màu); tự nộp + đáp án nộp trễ được báo', async () => {
    api.get.mockResolvedValue(
      makeResult({ passed: false, scorePct: 20, submitMode: 'AUTO' }, undefined, {
        lateAnswersIgnored: true,
      }),
    );
    await renderWithProviders(<MockResultScreen />);

    expect(await screen.findByText('Chưa đạt (ngưỡng 50%)')).toBeOnTheScreen();
    expect(screen.getByText('Tự nộp khi hết giờ')).toBeOnTheScreen();
    expect(screen.getByText(/gửi sau giờ nên không được tính/)).toBeOnTheScreen();
  });

  it('"Xem lại đáp án" sang màn riêng; "Ôn các câu sai" sang SR của bộ', async () => {
    api.get.mockResolvedValue(makeResult());
    await renderWithProviders(<MockResultScreen />);

    await fireEvent.press(await screen.findByText('Xem lại đáp án'));
    expect(router.push).toHaveBeenCalledWith({
      params: { attemptId: 'a1' },
      pathname: '/study/results/[attemptId]/review',
    });
    await fireEvent.press(screen.getByText('Ôn các câu sai'));
    expect(router.push).toHaveBeenCalledWith({ params: { setId: 's1' }, pathname: '/study/sr' });
  });

  it('MỘT nút chính ở thanh đáy; "Thi lại" và lịch sử là hàng phụ (không còn bốn nút ngang cấp)', async () => {
    api.get.mockResolvedValue(makeResult());
    await renderWithProviders(<MockResultScreen />);

    expect(await screen.findByRole('button', { name: 'Xem lại đáp án' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Thi lại'));
    expect(router.replace).toHaveBeenCalledWith({
      params: { setId: 's1' },
      pathname: '/study/sets/[setId]/mock',
    });
    await fireEvent.press(screen.getByText('Lịch sử thi của bộ này'));
    expect(router.push).toHaveBeenCalledWith({
      params: { setId: 's1' },
      pathname: '/study/history',
    });
  });

  it('lượt không có câu để xem lại ⇒ "Thi lại" thành nút chính duy nhất (không lặp hai chỗ)', async () => {
    api.get.mockResolvedValue(makeResult({}, []));
    await renderWithProviders(<MockResultScreen />);

    expect(await screen.findByText('Ôn các câu sai')).toBeOnTheScreen();
    expect(screen.queryByText('Xem lại đáp án')).toBeNull();
    expect(screen.getAllByText('Thi lại')).toHaveLength(1);
  });
});

describe('điểm là tâm điểm của màn', () => {
  it('vòng điểm có nhãn trợ năng đọc điểm THẬT (số lẻ dùng dấu phẩy) kèm kết quả', async () => {
    api.get.mockResolvedValue(makeResult({ correctCount: 2, scorePct: 66.7, total: 3 }));
    await renderWithProviders(<MockResultScreen />);

    expect(await screen.findByLabelText('Điểm 66,7 phần trăm. Đạt (ngưỡng 50%)')).toBeOnTheScreen();
    expect(screen.getByText('66,7%')).toBeOnTheScreen();
  });

  it('phân rã Đúng / Sai / Bỏ trống bằng icon + chữ + số, cộng lại đúng tổng số câu', async () => {
    api.get.mockResolvedValue(
      makeResult({ answeredCount: 5, correctCount: 3, scorePct: 50, total: 6 }),
    );
    await renderWithProviders(<MockResultScreen />);

    expect(await screen.findByLabelText('Đúng 3 câu')).toBeOnTheScreen();
    expect(screen.getByLabelText('Sai 2 câu')).toBeOnTheScreen();
    expect(screen.getByLabelText('Bỏ trống 1 câu')).toBeOnTheScreen();
  });

  it('nhận xét ngắn theo mức điểm: điểm tuyệt đối', async () => {
    api.get.mockResolvedValue(
      makeResult({ answeredCount: 2, correctCount: 2, passed: true, scorePct: 100, total: 2 }),
    );
    await renderWithProviders(<MockResultScreen />);
    expect(await screen.findByText('Điểm tuyệt đối!')).toBeOnTheScreen();
  });

  it('nhận xét ngắn theo mức điểm: chưa đạt và còn xa ngưỡng', async () => {
    api.get.mockResolvedValue(makeResult({ correctCount: 0, passed: false, scorePct: 10 }));
    await renderWithProviders(<MockResultScreen />);
    expect(await screen.findByText('Cần ôn thêm')).toBeOnTheScreen();
  });

  it('thời gian làm bài và số lần rời ứng dụng (chỉ ghi nhận) hiện thành dòng phụ', async () => {
    api.get.mockResolvedValue(
      makeResult({
        backgroundCount: 2,
        backgroundMs: 30_000,
        startedAt: '2026-09-20T08:00:00.000Z',
        submittedAt: '2026-09-20T08:12:05.000Z',
      }),
    );
    await renderWithProviders(<MockResultScreen />);

    expect(await screen.findByText('Làm trong 12 phút 5 giây')).toBeOnTheScreen();
    expect(screen.getByText('Rời ứng dụng 2 lần (30 giây)')).toBeOnTheScreen();
  });
});

describe('chủ đề yếu', () => {
  it('nêu TÊN + điểm chủ đề dưới 60% và gắn nhãn chữ "Cần ôn" ở đúng thanh đó', async () => {
    api.get.mockResolvedValue(makeResult({ byTag: TAGS_3 })); // toán 75% · lý 25% · chưa gắn thẻ 100%
    await renderWithProviders(<MockResultScreen />);

    expect(await screen.findByText('Chủ đề nên ôn lại')).toBeOnTheScreen();
    expect(screen.getByText('lý · 25%')).toBeOnTheScreen();
    expect(screen.getAllByText('Cần ôn')).toHaveLength(1);
  });

  it('không có chủ đề nào dưới 60% ⇒ báo "Không có chủ đề yếu", không có nhãn "Cần ôn"', async () => {
    api.get.mockResolvedValue(
      makeResult({
        byTag: [
          { correct: 4, tag: 'toán', total: 4 },
          { correct: 3, tag: 'lý', total: 4 },
        ],
      }),
    );
    await renderWithProviders(<MockResultScreen />);

    expect(await screen.findByText('Không có chủ đề yếu')).toBeOnTheScreen();
    expect(screen.queryByText('Cần ôn')).toBeNull();
  });

  it('lượt không có dữ liệu theo chủ đề ⇒ không vẽ khối chủ đề', async () => {
    api.get.mockResolvedValue(makeResult({ byTag: [] }));
    await renderWithProviders(<MockResultScreen />);

    expect(await screen.findByText('Đạt (ngưỡng 50%)')).toBeOnTheScreen();
    expect(screen.queryByText('Điểm theo chủ đề')).toBeNull();
    expect(screen.queryByText('Chủ đề nên ôn lại')).toBeNull();
  });
});

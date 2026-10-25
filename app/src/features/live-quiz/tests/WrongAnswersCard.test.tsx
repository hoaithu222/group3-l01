import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { liveQuizService } from '../api/live-quiz.service';
import type { QuizResultRowDto } from '../api/live-quiz.types';
import { WrongAnswersCard } from '../components/WrongAnswersCard';
import { resetLiveQuizStores, useLiveQuizStore } from '../store/live-quiz.store';

/**
 * app.md p5-01 §3 `Kết quả`: "Ôn lại câu sai" — số câu sai theo server; nội dung từng câu từ những gì máy đã thấy; lối sang bộ
 * học chỉ khi cờ `study` bật và tra được `setId`.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
const mockStudy = { current: true };
jest.mock('@/shell/capabilities', () => ({ useFeature: () => mockStudy.current }));

const OPTIONS = ['Hà Nội', 'Huế', 'Đà Nẵng', 'Cần Thơ'];

const mine = (answers: QuizResultRowDto['answers'], answered = 3): QuizResultRowDto => ({
  answered,
  answers,
  correct: 1,
  nickname: 'Tôi',
  rank: 2,
  score: 900,
  userId: 'u-me',
});

const WRONG_SERVER = [
  { choice: 0, correct: true, index: 0, itemId: 'i0', ms: 1000, points: 1200 },
  { choice: 3, correct: false, index: 1, itemId: 'i1', ms: 2000, points: 0 },
  { choice: null, correct: false, index: 2, itemId: 'i2', ms: null, points: 0 },
];

const historySpy = jest.spyOn(liveQuizService, 'history');

function seedStore(): void {
  const store = useLiveQuizStore.getState();
  store.rememberQuestion('s1', 1, { options: OPTIONS, prompt: 'Cố đô là?' });
  store.rememberReveal('s1', 1, { correct: 1, explanation: 'Huế từng là kinh đô nhà Nguyễn.' });
  store.saveAnswer('s1', 1, { acked: true, choice: 3 });
  store.rememberQuestion('s1', 2, { options: OPTIONS, prompt: 'Thành phố ven sông Hàn?' });
  store.rememberReveal('s1', 2, { correct: 2, explanation: null });
}

async function renderCard(row: QuizResultRowDto, setId?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<WrongAnswersCard mine={row} sessionId="s1" setId={setId} />, { wrapper: Wrapper });
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

beforeEach(() => {
  jest.clearAllMocks();
  resetLiveQuizStores();
  mockStudy.current = true;
  historySpy.mockResolvedValue({
    items: [
      {
        answered: 3,
        correct: 1,
        createdAt: '2026-09-25T00:00:00.000Z',
        endedAt: '2026-09-25T00:10:00.000Z',
        rank: 2,
        score: 900,
        sessionId: 's1',
        setId: 'set-9',
        setTitle: 'Địa lý',
        total: 3,
      },
    ],
    meta: { hasMore: false, limit: 20, nextCursor: null },
  });
});

it('số câu sai lấy từ `answers` của server; bấm "Ôn lại câu sai" ⇒ đề, đáp án tôi chọn, đáp án đúng, giải thích', async () => {
  seedStore();
  await renderCard(mine(WRONG_SERVER));

  expect(screen.getByText('Câu bạn làm sai (2)')).toBeOnTheScreen();
  expect(screen.queryByText('Cố đô là?')).toBeNull();

  await fireEvent.press(screen.getByRole('button', { name: 'Ôn lại câu sai' }));

  expect(screen.getByText('Cố đô là?')).toBeOnTheScreen();
  expect(screen.getByText('Bạn chọn: D. Cần Thơ')).toBeOnTheScreen();
  expect(screen.getByText('Đáp án đúng: B. Huế')).toBeOnTheScreen();
  expect(screen.getByText('Huế từng là kinh đô nhà Nguyễn.')).toBeOnTheScreen();
  // Câu bỏ trống cũng là sai (icon ✗ + chữ, không còn ký tự ✗ nằm trong chuỗi).
  expect(screen.getByText('Bạn chưa trả lời')).toBeOnTheScreen();
  await settle();
});

it('cờ `study` bật + tra được setId từ lịch sử ⇒ nút "Ôn tiếp bằng thẻ ghi nhớ" mở tổng quan bộ học', async () => {
  seedStore();
  await renderCard(mine(WRONG_SERVER));

  await fireEvent.press(await screen.findByRole('button', { name: 'Ôn tiếp bằng thẻ ghi nhớ' }));

  expect(router.push).toHaveBeenCalledWith({
    params: { setId: 'set-9' },
    pathname: '/study/sets/[setId]',
  });
  await settle();
});

it('cờ `study` tắt ⇒ không có nút sang bộ học và KHÔNG gọi lịch sử', async () => {
  mockStudy.current = false;
  seedStore();
  await renderCard(mine(WRONG_SERVER));

  expect(screen.queryByRole('button', { name: 'Ôn tiếp bằng thẻ ghi nhớ' })).toBeNull();
  await settle();
  expect(historySpy).not.toHaveBeenCalled();
});

it('mở lại từ lịch sử / máy khác (store rỗng) ⇒ chỉ còn số câu sai + lời giải thích, không có danh sách', async () => {
  await renderCard(mine(WRONG_SERVER));

  expect(screen.getByText('Câu bạn làm sai (2)')).toBeOnTheScreen();
  expect(screen.getByText(/chỉ xem lại được trên máy đã chơi/)).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Ôn lại câu sai' })).toBeNull();
  await settle();
});

it('đúng hết ⇒ lời khen, không có khối câu sai', async () => {
  await renderCard(
    mine([{ choice: 0, correct: true, index: 0, itemId: 'i0', ms: 900, points: 1300 }], 1),
  );

  expect(screen.getByText('Bạn trả lời đúng tất cả các câu — tuyệt vời!')).toBeOnTheScreen();
  expect(screen.queryByText(/Câu bạn làm sai/)).toBeNull();
  await settle();
});

it('chưa trả lời câu nào (answered = 0) và không sai câu nào ⇒ không hiện gì', async () => {
  await renderCard(mine([], 0));

  expect(screen.queryByText(/Câu bạn làm sai/)).toBeNull();
  expect(screen.queryByText(/tuyệt vời/)).toBeNull();
  await settle();
});

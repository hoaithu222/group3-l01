import { SocketEvent } from '@/core/socket';
import { useAuthStore } from '@/shell/store/slices/auth';

import { resetLiveQuizStores, useLiveQuizStore } from '../store/live-quiz.store';
import { emit, OPTIONS, SERVER_NOW, setupSession, snapshot } from './session-harness';

/**
 * app.md p5-01 §4/§5: `useLiveQuizSession` ghi câu hỏi + đáp án công bố vào `live-quiz.store` (cho "Ôn lại câu sai"), ghi cả
 * câu hiện tại khi vào giữa phiên, và đo độ lệch đồng hồ ngay lúc nhận snapshot.
 */

beforeEach(() => {
  jest.clearAllMocks();
  resetLiveQuizStores();
  useAuthStore.setState({ user: { id: 'u-me', name: 'Tôi' } as never });
});

it('ghi câu hỏi + đáp án công bố vào store (để "Ôn lại câu sai" sau phiên)', async () => {
  await setupSession();

  await emit(SocketEvent.QUIZ_QUESTION, {
    deadlineAt: SERVER_NOW + 20_000,
    index: 0,
    options: OPTIONS,
    prompt: 'Thủ đô của Việt Nam?',
    total: 3,
    version: 2,
  });
  await emit(SocketEvent.QUIZ_REVEAL, {
    correct: 0,
    explanation: 'Hà Nội là thủ đô',
    index: 0,
    stats: {},
  });

  const state = useLiveQuizStore.getState();
  expect(state.sessionId).toBe('s1');
  expect(state.questions[0]).toEqual({
    options: ['Hà Nội', 'Huế'],
    prompt: 'Thủ đô của Việt Nam?',
  });
  expect(state.reveals[0]).toEqual({ correct: 0, explanation: 'Hà Nội là thủ đô' });
});

it('vào giữa phiên (snapshot đã có câu hỏi) ⇒ câu hiện tại cũng được ghi nhớ', async () => {
  await setupSession(
    snapshot({
      currentIndex: 2,
      phase: 'QUESTION',
      question: {
        deadlineAt: SERVER_NOW + 9_000,
        index: 2,
        options: OPTIONS,
        prompt: 'Câu đang mở',
      },
      status: 'IN_PROGRESS',
    }),
  );

  expect(useLiveQuizStore.getState().questions[2]).toEqual({
    options: ['Hà Nội', 'Huế'],
    prompt: 'Câu đang mở',
  });
});

it('đo độ lệch đồng hồ ngay trong snapshot (serverNow − Date.now) để đồng hồ đếm theo server', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(SERVER_NOW - 120_000);
  const { result } = await setupSession();

  expect(result.current.offsetMs).toBe(120_000);
  jest.restoreAllMocks();
});

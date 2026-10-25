import { SocketEvent } from '@/core/socket';
import { useAuthStore } from '@/shell/store/slices/auth';

import { resetLiveQuizStores } from '../store/live-quiz.store';
import { cache, emit, OPTIONS, SERVER_NOW, setupSession, snapshot } from './session-harness';

/**
 * `quiz:progress` (BE p5-01, S→C CHỈ host, throttle 500 ms): số người đã trả lời câu đang mở. Client patch vào snapshot để
 * host thấy "Đã trả lời N/M"; gói của câu khác (đến muộn sau khi sang câu mới) bị bỏ, và câu mới đặt lại về 0.
 */

beforeEach(() => {
  jest.clearAllMocks();
  resetLiveQuizStores();
  useAuthStore.setState({ user: { id: 'u-host', name: 'Chủ phòng' } as never });
});

const QUESTION = (index: number) => ({
  deadlineAt: SERVER_NOW + 20_000,
  index,
  options: OPTIONS,
  prompt: `Câu ${String(index + 1)}`,
  total: 3,
  version: index + 2,
});

it('câu đang mở: `quiz:progress` cập nhật answeredCount và playersCount', async () => {
  await setupSession(snapshot({ currentIndex: 0, phase: 'QUESTION', pin: '123456' }));

  await emit(SocketEvent.QUIZ_PROGRESS, {
    answeredCount: 7,
    index: 0,
    playersCount: 12,
    sessionId: 's1',
  });

  expect(cache()).toMatchObject({ answeredCount: 7, playersCount: 12 });
});

it('gói của câu CŨ (index khác câu hiện tại) không đè số của câu mới', async () => {
  await setupSession(snapshot({ currentIndex: 1, phase: 'QUESTION', pin: '123456' }));
  await emit(SocketEvent.QUIZ_PROGRESS, {
    answeredCount: 4,
    index: 1,
    playersCount: 12,
    sessionId: 's1',
  });

  await emit(SocketEvent.QUIZ_PROGRESS, {
    answeredCount: 11,
    index: 0,
    playersCount: 12,
    sessionId: 's1',
  });

  expect(cache().answeredCount).toBe(4);
});

it('sang câu mới (`quiz:question`) thì đếm lại từ 0', async () => {
  await setupSession(snapshot({ currentIndex: 0, phase: 'QUESTION', pin: '123456' }));
  await emit(SocketEvent.QUIZ_PROGRESS, {
    answeredCount: 9,
    index: 0,
    playersCount: 12,
    sessionId: 's1',
  });

  await emit(SocketEvent.QUIZ_QUESTION, QUESTION(1));

  expect(cache()).toMatchObject({ answeredCount: 0, currentIndex: 1 });
});

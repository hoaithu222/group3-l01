import { SocketEvent } from '@/core/socket';
import { useAuthStore } from '@/shell/store/slices/auth';

import { resetLiveQuizStores } from '../store/live-quiz.store';
import { cache, emit, OPTIONS, SERVER_NOW, setupSession } from './session-harness';

/**
 * app.md p5-01 §8: mock socket phát chuỗi lobby → question → reveal → leaderboard → ended; patch cache đúng; câu mới reset
 * reveal; `me` riêng của BE (`{ rank, score }`) không làm mất `userId`.
 */

beforeEach(() => {
  jest.clearAllMocks();
  resetLiveQuizStores();
  useAuthStore.setState({ user: { id: 'u-me', name: 'Tôi' } as never });
});

it('chuỗi lobby → question → reveal → leaderboard → ended patch cache đúng từng bước', async () => {
  await setupSession();
  expect(cache().phase).toBe('LOBBY');

  // lobby (BE mới): cả phòng chỉ nhận `{ sessionId, players, playersCount }` — KHÔNG có `pin`.
  await emit(SocketEvent.QUIZ_LOBBY, {
    players: [
      { avatarAssetId: null, nickname: 'Tôi', userId: 'u-me' },
      { avatarAssetId: null, nickname: 'Bạn', userId: 'u-2' },
    ],
    playersCount: 2,
    sessionId: 's1',
  });
  expect(cache().players).toHaveLength(2);
  expect(cache().playersCount).toBe(2);
  expect(cache().pin).toBeUndefined();
  // Server cũ (lobby dựng theo góc nhìn host) lỡ kèm `pin` ⇒ vẫn KHÔNG được ghi vào cache của người chơi.
  await emit(SocketEvent.QUIZ_LOBBY, { pin: '123456', players: [{ avatarAssetId: null, nickname: 'Tôi', userId: 'u-me' }] });
  expect(cache().pin).toBeUndefined();
  expect(cache().players).toHaveLength(1);
  await emit(SocketEvent.QUIZ_LOBBY, {
    players: [
      { avatarAssetId: null, nickname: 'Tôi', userId: 'u-me' },
      { avatarAssetId: null, nickname: 'Bạn', userId: 'u-2' },
    ],
    playersCount: 2,
    sessionId: 's1',
  });

  await emit(SocketEvent.QUIZ_QUESTION, {
    deadlineAt: SERVER_NOW + 20_000,
    index: 0,
    options: OPTIONS,
    prompt: 'Thủ đô của Việt Nam?',
    total: 3,
    version: 2,
  });
  expect(cache()).toMatchObject({
    currentIndex: 0,
    phase: 'QUESTION',
    reveal: null,
    status: 'IN_PROGRESS',
    version: 2,
  });
  expect(cache().question?.prompt).toBe('Thủ đô của Việt Nam?');

  await emit(SocketEvent.QUIZ_REVEAL, {
    correct: 0,
    explanation: 'Hà Nội',
    index: 0,
    stats: { '0': 5, '1': 1 },
  });
  expect(cache().phase).toBe('REVEAL');
  expect(cache().reveal).toMatchObject({ correct: 0, index: 0 });

  await emit(SocketEvent.QUIZ_LEADERBOARD, {
    playersCount: 6,
    top: [{ cumulativeMs: 300, rank: 1, score: 1500, userId: 'u-2' }],
  });
  expect(cache().leaderboardTop[0]?.userId).toBe('u-2');
  // Bản cả phòng không có `me` ⇒ giữ nguyên hạng cũ của tôi.
  expect(cache().me).toMatchObject({ rank: 4, userId: 'u-me' });

  // Câu kế: reset reveal, phase về QUESTION.
  await emit(SocketEvent.QUIZ_QUESTION, {
    deadlineAt: SERVER_NOW + 50_000,
    index: 1,
    options: OPTIONS,
    prompt: 'Cố đô?',
    total: 3,
    version: 3,
  });
  expect(cache()).toMatchObject({ currentIndex: 1, phase: 'QUESTION', reveal: null, version: 3 });

  await emit(SocketEvent.QUIZ_ENDED, { reason: 'COMPLETED', status: 'FINISHED', version: 9 });
  expect(cache()).toMatchObject({ phase: 'ENDED', status: 'FINISHED', version: 9 });
});

it('`me` riêng của BE chỉ có { rank, score } ⇒ gộp vào hàng cũ, KHÔNG mất userId (bảng xếp hạng nhận ra dòng của mình)', async () => {
  await setupSession();

  await emit(SocketEvent.QUIZ_LEADERBOARD, {
    me: { rank: 2, score: 1200 },
    top: [{ cumulativeMs: 300, rank: 1, score: 1500, userId: 'u-2' }],
  });

  expect(cache().me).toEqual({ cumulativeMs: 900, rank: 2, score: 1200, userId: 'u-me' });
});

it('`me: null` từ BE ⇒ xoá hạng của tôi; payload không nhắc `me` ⇒ giữ nguyên', async () => {
  await setupSession();

  await emit(SocketEvent.QUIZ_LEADERBOARD, { top: [] });
  expect(cache().me).not.toBeNull();

  await emit(SocketEvent.QUIZ_LEADERBOARD, { me: null, top: [] });
  expect(cache().me).toBeNull();
});

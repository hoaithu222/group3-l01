import { act, renderHook } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { emitWithAck, SocketEvent } from '@/core/socket';

import { useQuizAnswer } from '../hooks/useQuizAnswer';
import { resetLiveQuizStores, useLiveQuizStore } from '../store/live-quiz.store';

/**
 * app.md p5-01 §4/§8: `quiz:answer` có ack — `QUIZ_004` = đã gửi (giữ NGUYÊN lựa chọn); mất ack thử lại ≤ 2 lần nếu còn hạn;
 * lựa chọn sống sót khi màn dựng lại giữa câu (LQ-08); câu mới ⇒ sạch.
 */

jest.mock('@/core/socket', () => ({
  ...jest.requireActual('@/core/socket'),
  emitWithAck: jest.fn(),
}));
const mockedEmit = jest.mocked(emitWithAck);

const NOW = 1_800_000_000_000;
const FUTURE = NOW + 60_000;
const PAST = NOW - 1_000;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  resetLiveQuizStores();
});

afterEach(() => jest.restoreAllMocks());

const choose = async (result: { current: ReturnType<typeof useQuizAnswer> }, choice: number) => {
  await act(async () => {
    result.current.choose(choice);
  });
};

it('ack ok ⇒ "sent"; gửi đúng payload {sessionId, index, choice}; lưu vào store (acked); rung nhẹ lúc chọn', async () => {
  mockedEmit.mockResolvedValue({ ok: true });
  const { result } = await renderHook(() => useQuizAnswer('s1', 2, FUTURE, 0));

  await choose(result, 1);

  expect(mockedEmit).toHaveBeenCalledWith(
    SocketEvent.QUIZ_ANSWER,
    { choice: 1, index: 2, sessionId: 's1' },
    3000,
  );
  expect(result.current).toMatchObject({ selected: 1, state: 'sent' });
  expect(useLiveQuizStore.getState().answers[2]).toEqual({ acked: true, choice: 1 });
  expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
});

it('ack `QUIZ_004` (server đã nhận trước đó) ⇒ coi là gửi thành công, KHÔNG đổi lựa chọn', async () => {
  mockedEmit.mockResolvedValue({ code: 'QUIZ_004', ok: false });
  const { result } = await renderHook(() => useQuizAnswer('s1', 0, FUTURE, 0));

  await choose(result, 3);

  expect(result.current).toMatchObject({ code: undefined, selected: 3, state: 'sent' });
});

it('đã "sent" ⇒ bấm lại KHÔNG gửi lần hai', async () => {
  mockedEmit.mockResolvedValue({ ok: true });
  const { result } = await renderHook(() => useQuizAnswer('s1', 0, FUTURE, 0));

  await choose(result, 0);
  await choose(result, 2);

  expect(mockedEmit).toHaveBeenCalledTimes(1);
  expect(result.current.selected).toBe(0);
});

it('mất ack + còn hạn ⇒ thử lại tối đa 2 lần (tổng 3 lượt) rồi báo lỗi ACK_TIMEOUT, giữ lựa chọn', async () => {
  mockedEmit.mockResolvedValue({ code: 'ACK_TIMEOUT', ok: false });
  const { result } = await renderHook(() => useQuizAnswer('s1', 0, FUTURE, 0));

  await choose(result, 1);

  expect(mockedEmit).toHaveBeenCalledTimes(3);
  expect(result.current).toMatchObject({ code: 'ACK_TIMEOUT', selected: 1, state: 'error' });
  expect(useLiveQuizStore.getState().answers[0]).toEqual({ acked: false, choice: 1 });
});

it('mất ack nhưng đã QUÁ HẠN ⇒ không thử lại, báo `QUIZ_005`', async () => {
  mockedEmit.mockResolvedValue({ code: 'ACK_TIMEOUT', ok: false });
  const { result } = await renderHook(() => useQuizAnswer('s1', 0, PAST, 0));

  await choose(result, 1);

  expect(mockedEmit).toHaveBeenCalledTimes(1);
  expect(result.current).toMatchObject({ code: 'QUIZ_005', state: 'error' });
});

it('lỗi rồi bấm Thử lại ⇒ gửi lại ĐÚNG lựa chọn cũ', async () => {
  mockedEmit
    .mockResolvedValueOnce({ code: 'QUIZ_009', ok: false })
    .mockResolvedValueOnce({ ok: true });
  const { result } = await renderHook(() => useQuizAnswer('s1', 0, FUTURE, 0));

  await choose(result, 2);
  expect(result.current.state).toBe('error');
  await act(async () => {
    result.current.retry();
  });

  expect(mockedEmit).toHaveBeenLastCalledWith(
    SocketEvent.QUIZ_ANSWER,
    { choice: 2, index: 0, sessionId: 's1' },
    3000,
  );
  expect(result.current).toMatchObject({ selected: 2, state: 'sent' });
});

it('màn dựng lại giữa câu (LQ-08) ⇒ vẫn nhớ đã chọn gì và server đã nhận chưa', async () => {
  mockedEmit.mockResolvedValue({ ok: true });
  const first = await renderHook(() => useQuizAnswer('s1', 0, FUTURE, 0));
  await choose(first.result, 1);
  await first.unmount();

  const second = await renderHook(() => useQuizAnswer('s1', 0, FUTURE, 0));

  expect(second.result.current).toMatchObject({ selected: 1, state: 'sent' });
});

it('dựng lại khi CHƯA được ack ⇒ "error" + Thử lại (không mở khoá để chọn lại)', async () => {
  useLiveQuizStore.getState().saveAnswer('s1', 0, { acked: false, choice: 2 });

  const { result } = await renderHook(() => useQuizAnswer('s1', 0, FUTURE, 0));

  expect(result.current).toMatchObject({ code: 'ACK_TIMEOUT', selected: 2, state: 'error' });
});

it('câu mới (index khác) / phiên khác ⇒ sạch, không mang lựa chọn sang', async () => {
  useLiveQuizStore.getState().saveAnswer('s1', 0, { acked: true, choice: 1 });

  const nextQuestion = await renderHook(() => useQuizAnswer('s1', 1, FUTURE, 0));
  const otherSession = await renderHook(() => useQuizAnswer('s2', 0, FUTURE, 0));

  expect(nextQuestion.result.current).toMatchObject({ selected: null, state: 'idle' });
  expect(otherSession.result.current).toMatchObject({ selected: null, state: 'idle' });
});

import { useMockPlayerStore } from '../store/mock-player.store';
import { createAnswerAutosaver } from '../utils/answer-autosaver';

/** Đồ dùng chung cho test bộ lưu đáp án (không phải test): mạng giả, `save` giả, store sạch. */
export const ans = (n: number) => ({ itemId: `q${n}`, optionIds: ['o_aaaaaa'] });
export const network = () => Object.assign(new Error('Network Error'), { isAxiosError: true });
export const tick = (ms: number) => jest.advanceTimersByTimeAsync(ms);

export const env = { online: true };
export const save = jest.fn();
export const onTerminal = jest.fn();

export function makeSaver() {
  const saver = createAnswerAutosaver('a1');
  saver.configure({ isOnline: () => env.online, onTerminal, save });
  saver.start();
  return saver;
}

export function resetHarness(): void {
  jest.useFakeTimers();
  jest.clearAllMocks();
  env.online = true;
  save.mockReset();
  save.mockResolvedValue({ answeredCount: 1 });
  useMockPlayerStore.setState({ attempts: {} });
}

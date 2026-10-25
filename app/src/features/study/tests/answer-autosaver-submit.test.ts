import { AUTOSAVE_DEBOUNCE_MS, SETTLE_TIMEOUT_MS } from '../utils/answer-batches';
import { ans, env, makeSaver, onTerminal, resetHarness, save, tick } from './autosaver-harness';
import { apiError } from './render-helpers';

/** Chuẩn bị nộp (README p4-02 §4 "Nộp"): chặn rủi ro lượt PUT đang bay tới BE sau khi chấm. */
beforeEach(resetHarness);
afterEach(() => jest.useRealTimers());

describe('nộp bài — rủi ro lượt PUT đang bay', () => {
  it('lô đang bay xong trong thời gian chờ → chỉ gửi kèm phần còn lại', async () => {
    let release: () => void = () => undefined;
    save.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));
    const saver = makeSaver();
    saver.queue(ans(1));
    await tick(AUTOSAVE_DEBOUNCE_MS);
    saver.queue(ans(2));

    const drained = saver.drainForSubmit();
    release();
    await expect(drained).resolves.toEqual([ans(2)]);
  });

  it('lô đang bay KHÔNG kịp xong → gửi kèm CẢ câu trong lô đó (BE upsert idempotent)', async () => {
    save.mockImplementationOnce(() => new Promise<void>(() => undefined));
    const saver = makeSaver();
    saver.queue(ans(1));
    await tick(AUTOSAVE_DEBOUNCE_MS);
    saver.queue(ans(2));

    const drained = saver.drainForSubmit();
    await tick(SETTLE_TIMEOUT_MS);
    await expect(drained).resolves.toEqual([ans(1), ans(2)]);
  });

  it('> 50 câu chưa lên: đẩy tuần tự các lô dư, trả ≤ 50 cho submit', async () => {
    env.online = false;
    const saver = makeSaver();
    for (let n = 1; n <= 120; n += 1) saver.queue(ans(n));
    env.online = true;

    const rest = await saver.drainForSubmit();
    expect(save.mock.calls.map((call) => (call[0] as unknown[]).length)).toEqual([50, 50]);
    expect(rest).toHaveLength(20);
  });

  it('lô dư bị 409 MOCK_004 → coi là kết thúc: báo màn, submit không kèm đáp án (không chặn nộp)', async () => {
    env.online = false;
    const saver = makeSaver();
    for (let n = 1; n <= 60; n += 1) saver.queue(ans(n));
    env.online = true;
    save.mockRejectedValueOnce(apiError(409, 'MOCK_004'));

    await expect(saver.drainForSubmit()).resolves.toEqual([]);
    expect(onTerminal).toHaveBeenCalledWith('MOCK_004');
  });
});

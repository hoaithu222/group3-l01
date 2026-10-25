import { AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_RETRY_MS, pendingAnswers } from '../utils/answer-batches';
import {
  ans,
  env,
  makeSaver,
  network,
  onTerminal,
  resetHarness,
  save,
  tick,
} from './autosaver-harness';
import { apiError } from './render-helpers';

/** Bộ lưu đáp án theo lô (README p4-02 §4): debounce, lô ≤ 50, pending chỉ gỡ khi server xác nhận. */
beforeEach(resetHarness);
afterEach(() => jest.useRealTimers());

describe('gửi theo lô', () => {
  it('gom các lần chọn trong khoảng debounce thành MỘT lượt PUT rồi gỡ khỏi pending', async () => {
    const saver = makeSaver();
    [1, 2, 3].forEach((n) => saver.queue(ans(n)));
    await tick(AUTOSAVE_DEBOUNCE_MS - 1);
    expect(save).not.toHaveBeenCalled();

    await tick(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0]).toEqual([ans(1), ans(2), ans(3)]);
    expect(pendingAnswers('a1')).toEqual([]);
  });

  it('120 câu chờ → mỗi lô ≤ 50 (50 + 50 + 20)', async () => {
    const saver = makeSaver();
    for (let n = 1; n <= 120; n += 1) saver.queue(ans(n));
    await tick(AUTOSAVE_DEBOUNCE_MS);
    expect(save.mock.calls.map((call) => (call[0] as unknown[]).length)).toEqual([50, 50, 20]);
  });

  it('đổi ý khi lô đang bay → KHÔNG gỡ pending, lượt sau gửi giá trị mới', async () => {
    let release: () => void = () => undefined;
    save.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));
    const saver = makeSaver();
    saver.queue(ans(1));
    await tick(AUTOSAVE_DEBOUNCE_MS);

    saver.queue({ itemId: 'q1', optionIds: ['o_bbbbbb'] });
    release();
    await tick(0);
    expect(pendingAnswers('a1')).toHaveLength(1);

    await tick(AUTOSAVE_DEBOUNCE_MS);
    expect(save.mock.calls.at(-1)?.[0]).toEqual([{ itemId: 'q1', optionIds: ['o_bbbbbb'] }]);
    expect(pendingAnswers('a1')).toEqual([]);
  });

  it('mất mạng: giữ pending, không gọi API; có mạng lại + flush → gửi', async () => {
    env.online = false;
    const saver = makeSaver();
    saver.queue(ans(1));
    await tick(AUTOSAVE_DEBOUNCE_MS);
    expect(save).not.toHaveBeenCalled();
    expect(pendingAnswers('a1')).toHaveLength(1);

    env.online = true;
    await saver.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('lỗi mạng: giữ pending và tự thử lại sau AUTOSAVE_RETRY_MS', async () => {
    save.mockRejectedValueOnce(network());
    const saver = makeSaver();
    saver.queue(ans(1));
    await tick(AUTOSAVE_DEBOUNCE_MS);
    expect(pendingAnswers('a1')).toHaveLength(1);

    await tick(AUTOSAVE_RETRY_MS);
    expect(save).toHaveBeenCalledTimes(2);
    expect(pendingAnswers('a1')).toEqual([]);
  });
});

describe('lỗi nghiệp vụ', () => {
  it('MOCK_003 → dừng gửi và báo màn (onTerminal); pending còn nguyên, drain trả []', async () => {
    save.mockRejectedValueOnce(apiError(409, 'MOCK_003'));
    const saver = makeSaver();
    saver.queue(ans(1));
    await tick(AUTOSAVE_DEBOUNCE_MS);

    expect(onTerminal).toHaveBeenCalledWith('MOCK_003');
    saver.queue(ans(2));
    await tick(AUTOSAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);
    await expect(saver.drainForSubmit()).resolves.toEqual([]);
  });

  it('MOCK_005 (một câu không thuộc đề) → gửi lại từng câu, chỉ câu hỏng bị bỏ', async () => {
    save.mockImplementation((batch: { itemId: string }[]) =>
      batch.some((a) => a.itemId === 'q2')
        ? Promise.reject(apiError(400, 'MOCK_005'))
        : Promise.resolve({}),
    );
    const saver = makeSaver();
    [1, 2, 3].forEach((n) => saver.queue(ans(n)));
    await tick(AUTOSAVE_DEBOUNCE_MS);

    expect(save.mock.calls.map((call) => (call[0] as unknown[]).length)).toEqual([3, 1, 1, 1]);
    expect(pendingAnswers('a1')).toEqual([]);
  });
});

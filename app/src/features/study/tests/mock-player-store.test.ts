import AsyncStorage from '@react-native-async-storage/async-storage';

import { MOCK_PLAYER_MAX_AGE_MS, MOCK_PLAYER_STORAGE_KEY } from '../store/mock-player.constants';
import { useMockPlayerStore } from '../store/mock-player.store';
import { resetStudyStores } from '../store/set-editor.store';
import { mergeAnswers, pruneStaleAttempts, sameAnswer } from '../utils/mock-player-utils';

/** `mock-player.store` (README p4-02 §5): bền qua tắt app (AsyncStorage), bỏ mục quá 24 giờ, dọn khi nộp/đăng xuất. */
const A = { itemId: 'q1', optionIds: ['o_aaaaaa'] };
const A2 = { itemId: 'q1', optionIds: ['o_bbbbbb'] };
const store = () => useMockPlayerStore.getState();
const stored = async (): Promise<{ state: { attempts: Record<string, unknown> } } | null> => {
  const raw = await AsyncStorage.getItem(MOCK_PLAYER_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as { state: { attempts: Record<string, unknown> } }) : null;
};

beforeEach(async () => {
  await AsyncStorage.clear();
  useMockPlayerStore.setState({ attempts: {} });
});

describe('đáp án chờ gửi', () => {
  it('saveAnswer ghi đáp án và đánh dấu pending (không trùng khi đổi ý cùng câu)', () => {
    store().saveAnswer('a1', A);
    store().saveAnswer('a1', A2);
    expect(store().attempts.a1?.answers.q1).toEqual(A2);
    expect(store().attempts.a1?.pending).toEqual(['q1']);
  });

  it('confirm chỉ gỡ pending khi giá trị KHÔNG đổi trong lúc bay', () => {
    store().saveAnswer('a1', A);
    store().confirm('a1', [A]);
    expect(store().attempts.a1?.pending).toEqual([]);

    store().saveAnswer('a1', A);
    store().saveAnswer('a1', A2); // người dùng đổi ý khi lô chứa A đang bay
    store().confirm('a1', [A]);
    expect(store().attempts.a1?.pending).toEqual(['q1']);
  });

  it('dropPending, clear, sự kiện chờ gửi', () => {
    store().saveAnswer('a1', A);
    store().pushEvent('a1', { at: 'x', clientEventId: 'ev-1', type: 'BACKGROUND' });
    store().dropPending('a1', ['q1']);
    expect(store().attempts.a1?.pending).toEqual([]);
    store().removeEvents('a1', ['ev-1']);
    expect(store().attempts.a1?.events).toEqual([]);
    store().clear('a1');
    expect(store().attempts.a1).toBeUndefined();
  });
});

describe('bền qua tắt app', () => {
  it('mỗi thay đổi được ghi xuống AsyncStorage dưới khoá study.mock-player.v1', async () => {
    store().saveAnswer('a1', A);
    const saved = await stored();
    expect(saved?.state.attempts).toHaveProperty('a1');
  });

  it('khởi động lại: rehydrate khôi phục mục còn mới và BỎ mục quá 24 giờ', async () => {
    const fresh = { answers: { q1: A }, currentIndex: 2, events: [], flagged: [], pending: ['q1'] };
    await AsyncStorage.setItem(
      MOCK_PLAYER_STORAGE_KEY,
      JSON.stringify({
        state: {
          attempts: {
            fresh: { ...fresh, updatedAt: Date.now() },
            stale: { ...fresh, updatedAt: Date.now() - MOCK_PLAYER_MAX_AGE_MS - 1000 },
          },
        },
        version: 1,
      }),
    );
    await useMockPlayerStore.persist.rehydrate();

    expect(store().attempts.fresh?.currentIndex).toBe(2);
    expect(store().attempts.fresh?.pending).toEqual(['q1']);
    expect(store().attempts.stale).toBeUndefined();
  });

  it('đăng xuất (resetStudyStores) xoá cả bộ nhớ lẫn bản trên đĩa', async () => {
    store().saveAnswer('a1', A);
    resetStudyStores();
    expect(store().attempts).toEqual({});
    const saved = await stored();
    expect(saved === null || Object.keys(saved.state.attempts).length === 0).toBe(true);
  });
});

describe('hàm thuần', () => {
  it('pruneStaleAttempts bỏ mục hỏng hình dạng', () => {
    expect(pruneStaleAttempts({ x: 'rác', y: { updatedAt: Date.now() } }).x).toBeUndefined();
    expect(pruneStaleAttempts({ y: { updatedAt: Date.now() } }).y?.pending).toEqual([]);
    expect(pruneStaleAttempts(null)).toEqual({});
  });

  it('mergeAnswers: câu còn pending ở máy THẮNG server; câu đã xác nhận lấy bản server', () => {
    store().saveAnswer('a1', A2); // chưa lên server
    store().saveAnswer('a1', { itemId: 'q2', optionIds: ['o_aaaaaa'] });
    store().confirm('a1', [{ itemId: 'q2', optionIds: ['o_aaaaaa'] }]);
    const merged = mergeAnswers(
      [
        { itemId: 'q1', optionIds: ['o_aaaaaa'], text: null },
        { itemId: 'q2', optionIds: ['o_bbbbbb'], text: null },
      ],
      store().attempts.a1,
    );
    expect(merged.q1?.optionIds).toEqual(['o_bbbbbb']);
    expect(merged.q2?.optionIds).toEqual(['o_bbbbbb']);
  });

  it('sameAnswer so nội dung, bỏ qua timeMs', () => {
    expect(sameAnswer(A, { ...A, timeMs: 900 })).toBe(true);
    expect(sameAnswer(A, A2)).toBe(false);
    expect(sameAnswer({ itemId: 'q1', text: 'a' }, { itemId: 'q1', text: 'a ' })).toBe(false);
  });
});

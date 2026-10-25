import type { QuizPlayerDto, QuizResultRowDto, QuizScoreRowDto } from '../api/live-quiz.types';
import {
  entriesFromResults,
  entriesFromScores,
  entryFromScore,
  splitPodium,
  type RankedEntry,
} from '../utils/ranked-entries';

/** Thứ tự/hạng của bảng xếp hạng và tách bục top 3 — dữ liệu thuần, không cần render. */

const row = (userId: string, rank: number, score = 1000 - rank * 100): QuizScoreRowDto => ({
  cumulativeMs: 0,
  rank,
  score,
  userId,
});
const player = (userId: string, nickname: string): QuizPlayerDto => ({
  avatarAssetId: null,
  nickname,
  userId,
});
const entry = (userId: string, rank: number): RankedEntry => ({
  name: userId,
  rank,
  score: 0,
  userId,
});

describe('entriesFromScores', () => {
  it('tra tên từ `players`; người không còn trong danh sách ⇒ "Người chơi"', () => {
    const entries = entriesFromScores([row('a', 1), row('b', 2)], [player('a', 'Minh Anh')]);

    expect(entries.map((e) => e.name)).toEqual(['Minh Anh', 'Người chơi']);
  });

  it('sắp theo hạng dù BE gửi lộn xộn (đổi hạng giữa phiên)', () => {
    const entries = entriesFromScores([row('c', 3), row('a', 1), row('b', 2)], []);

    expect(entries.map((e) => e.userId)).toEqual(['a', 'b', 'c']);
  });

  it('đồng hạng giữ nguyên thứ tự gặp', () => {
    const entries = entriesFromScores([row('x', 2), row('y', 2), row('z', 1)], []);

    expect(entries.map((e) => e.userId)).toEqual(['z', 'x', 'y']);
  });

  it('`entryFromScore` cho hàng của tôi (ngoài top)', () => {
    expect(entryFromScore(row('me', 9, 40), [player('me', 'Tôi')])).toMatchObject({
      name: 'Tôi',
      rank: 9,
      score: 40,
    });
  });
});

describe('entriesFromResults', () => {
  const result = (overrides: Partial<QuizResultRowDto>): QuizResultRowDto => ({
    answered: 10,
    correct: 8,
    nickname: 'An',
    rank: 1,
    score: 900,
    userId: 'u1',
    ...overrides,
  });

  it('dòng phụ "Đúng x/y câu đã trả lời" theo dữ liệu bền', () => {
    expect(entriesFromResults([result({})])[0]?.caption).toBe('Đúng 8/10 câu đã trả lời');
  });

  it('thiếu nickname ⇒ "Người chơi"', () => {
    expect(entriesFromResults([result({ nickname: null })])[0]?.name).toBe('Người chơi');
  });
});

describe('splitPodium', () => {
  it('tách 3 người đầu lên bục, còn lại là danh sách', () => {
    const { podium, rest } = splitPodium([1, 2, 3, 4, 5].map((n) => entry(`u${String(n)}`, n)));

    expect(podium.map((e) => e.rank)).toEqual([1, 2, 3]);
    expect(rest.map((e) => e.rank)).toEqual([4, 5]);
  });

  it('ít hơn 3 người ⇒ bục chỉ có chừng đó, danh sách rỗng', () => {
    const { podium, rest } = splitPodium([entry('a', 1), entry('b', 2)]);

    expect(podium).toHaveLength(2);
    expect(rest).toEqual([]);
  });

  it('đồng hạng 2: hai người chiếm hai chỗ đầu bục sau người nhất, số hạng in ra vẫn là hạng THẬT', () => {
    const { podium, rest } = splitPodium([
      entry('a', 1),
      entry('b', 2),
      entry('c', 2),
      entry('d', 4),
    ]);

    expect(podium.map((e) => e.rank)).toEqual([1, 2, 2]);
    expect(rest.map((e) => e.userId)).toEqual(['d']);
  });

  it('người đứng đầu danh sách đã ngoài top 3 (vd chỉ có hàng của tôi hạng 7) ⇒ không có bục', () => {
    const { podium, rest } = splitPodium([entry('me', 7)]);

    expect(podium).toEqual([]);
    expect(rest).toHaveLength(1);
  });

  it('danh sách rỗng', () => {
    expect(splitPodium([])).toEqual({ podium: [], rest: [] });
  });
});

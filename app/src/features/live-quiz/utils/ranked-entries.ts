import type { QuizPlayerDto, QuizResultRowDto, QuizScoreRowDto } from '../api/live-quiz.types';

/** Một dòng bảng xếp hạng đã có TÊN — dạng chung của bảng trực tiếp (`quiz:leaderboard`) và bảng kết quả bền (`results`). */
export interface RankedEntry {
  /** Dòng phụ dưới tên (vd "Đúng 8/10 câu đã trả lời") — bảng trực tiếp không có. */
  caption?: string;
  name: string;
  rank: number;
  score: number;
  userId: string;
}

const ANONYMOUS = 'Người chơi';

const byRank = (a: RankedEntry, b: RankedEntry): number => a.rank - b.rank;

/** Hàng điểm của BE không mang tên ⇒ tra tên từ `players` của snapshot (thiếu thì "Người chơi"). */
export function entriesFromScores(
  rows: QuizScoreRowDto[],
  players: QuizPlayerDto[],
): RankedEntry[] {
  const names = new Map(players.map((player) => [player.userId, player.nickname]));
  return rows
    .map((row) => ({
      name: names.get(row.userId) ?? ANONYMOUS,
      rank: row.rank,
      score: row.score,
      userId: row.userId,
    }))
    .sort(byRank);
}

export function entryFromScore(row: QuizScoreRowDto, players: QuizPlayerDto[]): RankedEntry {
  return entriesFromScores([row], players)[0] as RankedEntry;
}

/** Kết quả bền: có tên + số câu đúng/đã trả lời. */
export function entriesFromResults(rows: QuizResultRowDto[]): RankedEntry[] {
  return rows
    .map((row) => ({
      caption: `Đúng ${String(row.correct)}/${String(row.answered)} câu đã trả lời`,
      name: row.nickname ?? ANONYMOUS,
      rank: row.rank,
      score: row.score,
      userId: row.userId,
    }))
    .sort(byRank);
}

/**
 * Tách bục nhận giải (tối đa 3 người đứng đầu, theo THỨ TỰ trong danh sách) khỏi phần còn lại. Đồng hạng thì vẫn theo vị trí:
 * hai người cùng hạng 2 chiếm hai chỗ đầu bục sau người hạng 1; số hạng in trên huy chương là hạng THẬT, không phải vị trí.
 * Ít hơn 3 người ⇒ bục chỉ có chừng đó cột.
 */
export function splitPodium(entries: RankedEntry[]): {
  podium: RankedEntry[];
  rest: RankedEntry[];
} {
  const podium = entries.slice(0, 3).filter((entry) => entry.rank <= 3);
  return { podium, rest: entries.slice(podium.length) };
}

import { Text } from 'react-native';

import type { QuizPlayerDto, QuizScoreRowDto } from '../api/live-quiz.types';
import { entriesFromScores, entryFromScore } from '../utils/ranked-entries';
import { BoardCard } from './BoardCard';
import { RankedBoard } from './RankedBoard';

interface LiveLeaderboardProps {
  me: QuizScoreRowDto | null;
  players: QuizPlayerDto[];
  rows: QuizScoreRowDto[];
  /** `podium` cho màn kết thúc phiên (top 3 lên bục); mặc định `list` gọn cho giữa phiên. */
  variant?: 'list' | 'podium';
}

/**
 * Top N + hạng của tôi (khi tôi ngoài top). Hàng điểm của BE không mang tên ⇒ tra tên từ `players` của snapshot. Dòng của tôi
 * được nhấn; thứ hạng đổi thì dòng trượt tới chỗ mới (Reanimated layout — tắt khi "Giảm chuyển động", xem `MotionView`).
 */
export function LiveLeaderboard({ me, players, rows, variant = 'list' }: LiveLeaderboardProps) {
  const meInTop = me ? rows.some((row) => row.userId === me.userId) : true;

  return (
    <BoardCard>
      {rows.length === 0 ? (
        <Text className="text-body-md text-fg-2">Chưa có điểm.</Text>
      ) : (
        <RankedBoard
          entries={entriesFromScores(rows, players)}
          extra={me && !meInTop ? entryFromScore(me, players) : null}
          meId={me?.userId}
          variant={variant}
        />
      )}
    </BoardCard>
  );
}

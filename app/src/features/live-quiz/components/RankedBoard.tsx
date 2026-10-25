import { View } from 'react-native';

import { Divider } from '@/shared/ui/divider';

import { splitPodium, type RankedEntry } from '../utils/ranked-entries';
import { PodiumTop3 } from './PodiumTop3';
import { RankRow } from './RankRow';

export interface RankedBoardProps {
  entries: RankedEntry[];
  /** Dòng của tôi nằm NGOÀI danh sách (ngoài top) — in thêm ở cuối, sau một đường kẻ. */
  extra?: RankedEntry | null;
  meId?: string | null;
  /** `podium` = top 3 lên bục, phần còn lại là danh sách; `list` = chỉ danh sách (gọn, dùng giữa phiên). */
  variant?: 'list' | 'podium';
}

/**
 * Thân bảng xếp hạng dùng chung cho bảng TRỰC TIẾP (`LiveLeaderboard`) và KẾT QUẢ BỀN (`ResultsScreen`): cùng một khuôn dòng,
 * cùng bục nhận giải. Dòng của CHÍNH người chơi được nhấn (nền cam nhạt + "(bạn)"); đổi thứ hạng thì dòng trượt tới chỗ mới.
 */
export function RankedBoard({
  entries,
  extra = null,
  meId = null,
  variant = 'list',
}: RankedBoardProps) {
  const { podium, rest } =
    variant === 'podium' ? splitPodium(entries) : { podium: [], rest: entries };

  return (
    <View className="gap-sm">
      {podium.length > 0 ? <PodiumTop3 entries={podium} meId={meId} /> : null}
      <View className="gap-2xs">
        {rest.map((entry) => (
          <RankRow key={entry.userId} entry={entry} me={entry.userId === meId} />
        ))}
      </View>
      {extra ? (
        <View className="gap-xs">
          <Divider variant="dashed" />
          <RankRow entry={extra} me />
        </View>
      ) : null}
    </View>
  );
}

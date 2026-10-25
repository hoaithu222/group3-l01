import { View } from 'react-native';

import type { AchievementStat } from '../../utils/achievement-stats';
import { HomeStatTile } from './HomeStatTile';

const COLUMNS = 2;

/** Cắt mảng thành các hàng `COLUMNS` ô. */
function toRows(stats: readonly AchievementStat[]): AchievementStat[][] {
  const rows: AchievementStat[][] = [];
  for (let index = 0; index < stats.length; index += COLUMNS) {
    rows.push(stats.slice(index, index + COLUMNS));
  }
  return rows;
}

/**
 * Lưới "Thành tích" 2 cột (tối đa 2×2). Rỗng ⇒ `null` — nơi gọi (`pickAchievementStats`) đã loại ô bằng 0, nên tất cả
 * bằng 0 thì cả khối biến mất chứ không hiện một lưới toàn số 0. Số ô lẻ: ô cuối chiếm trọn hàng (`flex-1`).
 */
export function HomeAchievementGrid({ stats }: { stats: readonly AchievementStat[] }) {
  if (stats.length === 0) return null;
  return (
    <View className="gap-sm">
      {toRows(stats).map((row) => (
        <View key={row.map((stat) => stat.key).join('|')} className="flex-row gap-sm">
          {row.map((stat) => (
            <HomeStatTile key={stat.key} stat={stat} />
          ))}
        </View>
      ))}
    </View>
  );
}

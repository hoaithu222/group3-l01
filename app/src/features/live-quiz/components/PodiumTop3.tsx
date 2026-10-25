import { View } from 'react-native';

import type { RankedEntry } from '../utils/ranked-entries';
import { PodiumColumn } from './PodiumColumn';

export interface PodiumTop3Props {
  /** Tối đa 3 người đứng đầu, theo thứ tự (`splitPodium`). */
  entries: RankedEntry[];
  meId?: string | null;
}

/** Thứ tự trái → phải của bục: hạng 2 · hạng 1 (giữa, cao nhất) · hạng 3. Số là CHỈ SỐ trong `entries`, không phải hạng. */
const ORDER: readonly (0 | 1 | 2)[] = [1, 0, 2];
const POSITION = [1, 2, 3] as const;

/** Bục nhận giải cho top 3 — chỉ có chừng đó cột nếu phòng ít hơn 3 người; cột trống giữ chỗ để người đứng nhất luôn ở giữa. */
export function PodiumTop3({ entries, meId }: PodiumTop3Props) {
  return (
    <View className="flex-row items-end gap-xs px-xs pt-sm">
      {ORDER.map((slot) => {
        const entry = entries[slot];
        return entry ? (
          <PodiumColumn
            key={entry.userId}
            entry={entry}
            me={entry.userId === meId}
            position={POSITION[slot]}
          />
        ) : (
          <View key={`empty-${String(slot)}`} className="flex-1" />
        );
      })}
    </View>
  );
}

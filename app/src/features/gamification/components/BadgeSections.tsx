import { View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { Section } from '@/shared/ui/section';

import type { BadgeDto } from '../api/gamification.types';
import { BadgeGridTile } from './BadgeGridTile';

export interface BadgeSectionsProps {
  badges: BadgeDto[];
  /** Đang chỉnh trưng bày: ô đã đạt là ô chọn. */
  editing: boolean;
  selectedIds: ReadonlySet<string>;
  onPress: (badge: BadgeDto) => void;
}

const COLUMNS = 2;

/** Cắt danh sách thành các hàng `COLUMNS` ô (lưới tự dựng: danh mục ngắn, không cần `FlatList numColumns`). */
function toRows(badges: readonly BadgeDto[]): BadgeDto[][] {
  const rows: BadgeDto[][] = [];
  for (let index = 0; index < badges.length; index += COLUMNS) {
    rows.push(badges.slice(index, index + COLUMNS));
  }
  return rows;
}

interface BadgeGridProps extends Omit<BadgeSectionsProps, 'badges'> {
  badges: readonly BadgeDto[];
}

/**
 * Lưới 2 cột BẰNG NHAU. ⚠️ Hàng lẻ có một ô giữ chỗ `flex-1` — thiếu nó, ô cuối giãn hết bề ngang và to gấp đôi các ô
 * khác (lưới "gãy" ở đúng hàng cuối).
 */
function BadgeGrid({ badges, editing, onPress, selectedIds }: BadgeGridProps) {
  return (
    <View className="gap-sm">
      {toRows(badges).map((row) => (
        <View key={row.map((badge) => badge.id).join('|')} className="flex-row gap-sm">
          {row.map((badge) => (
            <BadgeGridTile
              key={badge.id}
              badge={badge}
              selectable={editing}
              selected={editing && selectedIds.has(badge.id)}
              onPress={onPress}
            />
          ))}
          {row.length < COLUMNS ? <View className="flex-1" /> : null}
        </View>
      ))}
    </View>
  );
}

/**
 * Danh mục huy hiệu chia "Đã đạt" / "Chưa đạt" thành lưới 2 cột (chưa đạt ghi "Chưa đạt · 32/50" bằng chữ + ổ khoá).
 * Ô là thẻ độc lập (`BadgeGridTile` tự có nền + viền) nên không bọc thêm `Card` — thẻ lồng thẻ chỉ thêm một lớp nền.
 */
export function BadgeSections({ badges, editing, onPress, selectedIds }: BadgeSectionsProps) {
  const unlocked = badges.filter((badge) => badge.unlockedAt);
  const locked = badges.filter((badge) => !badge.unlockedAt);
  const shared = { editing, onPress, selectedIds };

  return (
    <View className="gap-xl">
      {badges.length === 0 ? (
        <EmptyState
          description="Hoàn thành công việc, ôn tập và làm bài kiểm tra để mở huy hiệu."
          icon="star"
          size="compact"
          title="Chưa có huy hiệu nào"
          tone="accent"
        />
      ) : null}
      {unlocked.length > 0 ? (
        <Section icon="checkmark-circle" title={`Đã đạt (${unlocked.length})`}>
          <BadgeGrid badges={unlocked} {...shared} />
        </Section>
      ) : null}
      {locked.length > 0 ? (
        <Section icon="lock" title={`Chưa đạt (${locked.length})`}>
          <BadgeGrid badges={locked} {...shared} />
        </Section>
      ) : null}
    </View>
  );
}

import { Text, View } from 'react-native';

import type { ThemeColorKey } from '@/shared/theme';
import { Card } from '@/shared/ui/card';
import { Icon, type IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';

import { describeTrend, type HistoryStats, type TrendKind } from '../../utils/mock-history-stats';

/**
 * Ô số liệu: ô icon có tông (mỗi số một hình + màu riêng để mắt tách ba con số khi liếc) + số + nhãn. Viền mảnh, không nền
 * `surface-*` — ba ô cùng một nền xanh như trước thì ô icon tông `info` chìm mất. Màu chỉ là lớp phụ: nhãn chữ luôn có, và cả
 * khối đọc một câu đầy đủ (`describeTrend`) cho trình đọc màn hình.
 */
function Stat({
  icon,
  label,
  tone,
  value,
}: {
  icon: IconName;
  label: string;
  tone: IconTileTone;
  value: string;
}) {
  return (
    <View className="flex-1 items-center gap-2xs rounded-sm border-hairline border-border-1 px-xs py-sm">
      <IconTile name={icon} size="sm" tone={tone} />
      <Text className="text-header-sm font-bold text-fg-1" maxFontSizeMultiplier={1.3}>
        {value}
      </Text>
      <Text className="text-center text-caption-sm text-fg-2" maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </View>
  );
}

const TREND: Record<TrendKind, { color: ThemeColorKey; icon: IconName; label: string }> = {
  down: { color: 'error', icon: 'arrow-down-small', label: 'Đang giảm' },
  flat: { color: 'fg-2', icon: 'minus', label: 'Ổn định' },
  up: { color: 'success', icon: 'arrow-up-small', label: 'Đang tiến bộ' },
};

/**
 * Đầu lịch sử thi: số lượt · điểm trung bình · điểm cao nhất (của phần ĐÃ TẢI), và — khi mọi lượt thuộc MỘT bộ — biểu đồ cột
 * các lượt gần nhất (cũ → mới, lượt mới nhất đậm) kèm xu hướng bằng chữ + mũi tên. Cột chỉ là hình: nhãn trợ năng của khối
 * đọc đủ các con số (`describeTrend`). Chỉ dùng điểm đã có trong dòng lịch sử — không gọi thêm API.
 */
export function HistoryTrend({ stats }: { stats: HistoryStats }) {
  const trend = stats.trend ? TREND[stats.trend] : null;
  const last = stats.series.length - 1;
  return (
    <View className="px-md pb-xs pt-xs">
      <Card>
        <View accessibilityLabel={describeTrend(stats)} accessible className="gap-md">
          <View className="flex-row gap-xs">
            {/* `history` tông `info` = bản sắc Thi thử (`STUDY_MODE_META.mock`); điểm TB/cao nhất xoay tông cho khác ô bên cạnh. */}
            <Stat icon="history" label="Lượt đã thi" tone="info" value={String(stats.attempts)} />
            <Stat
              icon="analytics-02"
              label="Điểm trung bình"
              tone="brand"
              value={String(stats.average)}
            />
            <Stat icon="star" label="Điểm cao nhất" tone="accent" value={String(stats.best)} />
          </View>
          {stats.series.length >= 2 ? (
            <View className="gap-xs">
              <View className="flex-row items-center justify-between gap-sm">
                <Text className="flex-1 text-label-md font-semibold text-fg-1">
                  {`${stats.series.length} lượt gần nhất`}
                </Text>
                {trend ? (
                  <View className="flex-row items-center gap-3xs">
                    <Icon color={trend.color} name={trend.icon} size={16} />
                    <Text className="text-label-md text-fg-1">{trend.label}</Text>
                  </View>
                ) : null}
              </View>
              <View className="h-16 flex-row items-end gap-xs">
                {stats.series.map((pct, i) => (
                  <View key={`${i}-${pct}`} className="h-full flex-1 justify-end">
                    <View
                      className={
                        i === last
                          ? 'rounded-3xs bg-action-info'
                          : 'rounded-3xs bg-border-info-subtle'
                      }
                      style={{ height: `${Math.max(6, Math.min(100, pct))}%` }}
                    />
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </Card>
    </View>
  );
}

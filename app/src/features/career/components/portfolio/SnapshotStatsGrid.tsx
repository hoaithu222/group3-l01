import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

import type { PortfolioProject } from '../../api/portfolio.types';
import {
  SNAPSHOT_STAT_FALLBACK,
  SNAPSHOT_STAT_VISUAL,
} from '../../constants/career-visuals.constants';
import { snapshotAtText, snapshotStats } from '../../utils/portfolio-text';

export interface SnapshotStatsGridProps {
  project: PortfolioProject;
  /** Đang làm mới số liệu. */
  refreshing: boolean;
  /** Giây còn phải chờ sau 429 `PORT_007` (`0` = được làm mới). */
  waitSeconds: number;
  offline: boolean;
  onRefresh: () => void;
}

/**
 * Số liệu HỆ THỐNG ghi nhận của dự án (app.md p6-07 §3, §7): mỗi dòng là "nhãn: giá trị kèm đơn vị" (`ListItem` đọc liền một câu cho trình đọc màn hình), kèm mốc chụp
 * "Cập nhật lúc …" và nút "Làm mới số liệu". Người dùng KHÔNG sửa được số nào — đó là điểm của portfolio "không tự khai" (README §1).
 * Hạn mức làm mới 10 lượt/giờ: quá thì nút đếm ngược thay vì báo lỗi (`PORT_007`).
 */
export function SnapshotStatsGrid({
  offline,
  onRefresh,
  project,
  refreshing,
  waitSeconds,
}: SnapshotStatsGridProps) {
  const stats = snapshotStats(project.snapshot);
  const waiting = waitSeconds > 0;

  return (
    <Card
      footer={
        <Button
          disabled={waiting || offline}
          iconLeft="reload"
          label={waiting ? `Thử lại sau ${waitSeconds}s` : 'Làm mới số liệu'}
          loading={refreshing}
          variant="secondary"
          onPress={onRefresh}
        />
      }
      title="Số liệu hệ thống ghi nhận"
    >
      <View>
        {stats.map((line, index) => {
          // Ô icon theo loại số liệu — mốc nhìn khi quét cột số; nhãn + giá trị vẫn đọc liền một câu (ô icon không nhãn, bị ẩn).
          const visual = SNAPSHOT_STAT_VISUAL[line.key] ?? SNAPSHOT_STAT_FALLBACK;
          return (
            <ListItem
              key={line.key}
              divider={index < stats.length - 1}
              label={line.label}
              leading={<IconTile name={visual.icon} size="sm" tone={visual.tone} />}
              value={line.value}
            />
          );
        })}
      </View>
      <View className="gap-3xs pt-xs">
        <Text className="text-caption-sm text-fg-2">{snapshotAtText(project)}</Text>
        <Text className="text-caption-sm text-fg-2">
          Dữ liệu do hệ thống ghi nhận từ task đã hoàn thành của bạn.
        </Text>
      </View>
    </Card>
  );
}

import { Pressable, Text, View } from 'react-native';

import { AttachmentProgress } from '@/shared/ui/attachment';
import { Badge } from '@/shared/ui/badge';
import { IconTile } from '@/shared/ui/icon-tile';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { ScanSummary } from '../api/plagiarism.types';
import {
  isScanActive,
  levelLabel,
  scanModeLabel,
  scanStatusArt,
  scanStatusLabel,
} from '../utils/level-label';

interface ScanStatusRowProps {
  maxLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  onPress: () => void;
  scan: ScanSummary;
  targetCount: number;
}

/**
 * Một dòng danh sách lượt quét (app.md §3): người yêu cầu, số tệp, trạng thái, tiến độ, mức cao nhất.
 *
 * Ô icon theo trạng thái (tông + hình, `scanStatusArt`) + `Badge` có CHỮ — trạng thái không chỉ dựa vào màu. Thêm ngày
 * tạo và ghi chú (dữ liệu đã có trong `ScanSummary`, trước đây không hiện) để phân biệt các lượt cùng số tệp.
 * ⚠️ `accessibilityLabel` gộp đủ ý cho cả dòng: thanh tiến độ bên trong có vai `progressbar` riêng.
 */
export function ScanStatusRow({ maxLevel, onPress, scan, targetCount }: ScanStatusRowProps) {
  const active = isScanActive(scan.status);
  const art = scanStatusArt(scan.status);
  const status = scanStatusLabel(scan.status);
  const created = formatDateTime(scan.createdAt);
  const progress = Math.max(0, Math.min(100, Math.round(scan.progress)));
  const spoken = [
    `Lượt quét ${targetCount} tệp`,
    status,
    active ? `tiến độ ${progress}%` : null,
    scanModeLabel(scan.mode),
    created ? `tạo lúc ${created}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityHint="Mở báo cáo lượt quét"
      accessibilityLabel={spoken}
      accessibilityRole="button"
      className="gap-sm rounded-md bg-bg-1 p-md active:opacity-80"
      onPress={onPress}
    >
      <View className="flex-row items-center gap-sm">
        <IconTile name={art.icon} tone={art.tone} />
        <View className="flex-1 gap-3xs">
          <Text className="text-label-lg font-semibold text-fg-1">{targetCount} tệp</Text>
          <Text className="text-caption-lg text-fg-2" numberOfLines={1}>
            {created ? `${scanModeLabel(scan.mode)} · ${created}` : scanModeLabel(scan.mode)}
          </Text>
        </View>
        <Badge label={status} variant={art.badge} />
      </View>
      {active ? <AttachmentProgress label={`Đang quét ${progress}%`} progress={progress} /> : null}
      {maxLevel !== undefined && maxLevel !== null ? (
        <Text className="text-caption-lg text-fg-2">Mức cao nhất: {levelLabel(maxLevel)}</Text>
      ) : null}
      {scan.note ? (
        <Text className="text-body-md text-fg-2" numberOfLines={2}>
          {scan.note}
        </Text>
      ) : null}
    </Pressable>
  );
}

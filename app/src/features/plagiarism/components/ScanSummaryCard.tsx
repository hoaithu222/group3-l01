import { Text, View } from 'react-native';

import { AttachmentProgress } from '@/shared/ui/attachment';
import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { ScanSummary } from '../api/plagiarism.types';
import { isScanActive, scanModeLabel, scanStatusArt, scanStatusLabel } from '../utils/level-label';

/**
 * Thẻ tóm tắt đầu màn báo cáo: ô icon theo trạng thái + tên trạng thái (chữ, không chỉ màu) + chế độ · số tệp, thanh
 * tiến độ khi còn chạy, rồi các mốc thời gian/ghi chú — dữ liệu đã có trong `ScanSummary` mà bản cũ không hiện.
 *
 * ⚠️ Mốc thời gian là `ListItem` nhãn–giá trị (giá trị KHÔNG cắt dòng, xem `ListItem`). "Lưu đến" = `expiresAt`: báo cáo
 * hết hạn thì thành `EXPIRED`, người dùng cần biết trước để kịp đối chiếu.
 */
export function ScanSummaryCard({ scan }: { scan: ScanSummary }) {
  const active = isScanActive(scan.status);
  const art = scanStatusArt(scan.status);
  const progress = Math.max(0, Math.min(100, Math.round(scan.progress)));
  const finished = formatDateTime(scan.finishedAt);

  return (
    <Card>
      <View className="flex-row items-center gap-sm">
        <IconTile name={art.icon} size="lg" tone={art.tone} />
        <View className="flex-1 gap-3xs">
          <Text accessibilityRole="header" className="text-header-sm font-semibold text-fg-1">
            {scanStatusLabel(scan.status)}
          </Text>
          <Text className="text-body-md text-fg-2">
            {scanModeLabel(scan.mode)} · {scan.targetResourceIds.length} tệp
          </Text>
        </View>
      </View>
      {active ? (
        <View className="gap-xs">
          <AttachmentProgress label={`Đang quét ${progress}%`} progress={progress} />
          <Text className="text-caption-lg text-fg-2">
            {progress}% · Bạn có thể rời màn này, sẽ có thông báo khi xong.
          </Text>
        </View>
      ) : null}
      <ListItem label="Tạo lúc" value={formatDateTime(scan.createdAt, '—')} />
      {finished ? <ListItem label="Kết thúc lúc" value={finished} /> : null}
      <ListItem label="Lưu báo cáo đến" value={formatDateTime(scan.expiresAt, '—')} />
      {scan.note ? <ListItem label="Ghi chú" value={scan.note} /> : null}
    </Card>
  );
}

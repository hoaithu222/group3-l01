import { Card } from '@/shared/ui/card';
import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { Section } from '@/shared/ui/section';

import type { ChannelDetail } from '../api';

export interface ChannelDangerZoneCardProps {
  channel: ChannelDetail;
  onArchive: () => void;
  onLeave: () => void;
  onRestore: () => void;
  restoreLoading: boolean;
}

interface DangerRow {
  danger: boolean;
  description: string;
  disabled?: boolean;
  icon: IconName;
  key: string;
  label: string;
  onPress: () => void;
  tone: IconTileTone;
}

/**
 * Khối "Nguy hiểm" — Lưu trữ/Khôi phục/Rời kênh (app.md §3: "không có với kênh mặc định").
 *
 * Mỗi việc là MỘT hàng (ô icon + chữ đỏ cho việc phá huỷ) trong một khung — cùng mẫu khối "Nguy hiểm" của Cài đặt nhóm — thay
 * cho cụm nút viền đỏ đầy bề ngang xếp dọc (quá nổi so với việc hiếm khi làm, dễ bấm nhầm khi cuộn). Lưu trữ/Rời vẫn đi qua
 * bước xác nhận ở màn cha (`ArchiveChannelSheet` / hộp thoại rời kênh). Không hàng nào hiện ⇒ không vẽ cả khối.
 */
export function ChannelDangerZoneCard({
  channel,
  onArchive,
  onLeave,
  onRestore,
  restoreLoading,
}: ChannelDangerZoneCardProps) {
  const { myPermissions } = channel;
  const rows: DangerRow[] = [];

  if (myPermissions.canArchive && channel.status === 'ACTIVE') {
    rows.push({
      danger: true,
      description: 'Kênh chuyển sang chỉ đọc, có thể khôi phục sau',
      icon: 'lock',
      key: 'archive',
      label: 'Lưu trữ kênh',
      onPress: onArchive,
      tone: 'danger',
    });
  }
  if (myPermissions.canArchive && channel.status === 'ARCHIVED') {
    rows.push({
      danger: false,
      description: restoreLoading ? 'Đang khôi phục…' : 'Cho phép gửi tin trong kênh trở lại',
      disabled: restoreLoading,
      icon: 'reload',
      key: 'restore',
      label: 'Khôi phục kênh',
      onPress: onRestore,
      tone: 'success',
    });
  }
  if (myPermissions.canLeave && !channel.isDefault) {
    rows.push({
      danger: true,
      description: 'Bạn sẽ không nhận tin nhắn của kênh này nữa',
      icon: 'logout',
      key: 'leave',
      label: 'Rời kênh',
      onPress: onLeave,
      tone: 'danger',
    });
  }

  if (rows.length === 0) return null;

  return (
    <Section icon="alert-warning" title="Nguy hiểm">
      <Card className="px-md py-2xs" padded={false}>
        {rows.map((row, index) => (
          <ListItem
            key={row.key}
            className="py-xs"
            description={row.description}
            disabled={row.disabled}
            divider={index < rows.length - 1}
            emphasis={row.danger ? 'danger' : 'title'}
            label={row.label}
            leading={<IconTile name={row.icon} tone={row.tone} />}
            onPress={row.onPress}
          />
        ))}
      </Card>
    </Section>
  );
}

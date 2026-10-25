import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { SnapshotView } from '../api/docs.types';
import { SNAPSHOT_KIND_ART, SNAPSHOT_KIND_LABEL } from '../constants/docs.constants';
import { sizeText, snapshotTitle } from '../utils/docs-format';

export interface SnapshotRowProps {
  snapshot: SnapshotView;
  onPress: (snapshot: SnapshotView) => void;
}

/**
 * Một bản lưu (app.md §3): loại (Tự động · Thủ công · Trước khi khôi phục — luôn bằng CHỮ), nhãn, người lưu, giờ và dung lượng. Chạm → xem
 * bản đó (chỉ đọc). Bản tự động không có người lưu ("Hệ thống").
 */
export function SnapshotRow({ onPress, snapshot }: SnapshotRowProps) {
  const who = snapshot.createdBy?.name ?? 'Hệ thống';
  const when = formatDateTime(snapshot.at);

  return (
    <Pressable
      accessibilityLabel={`${snapshotTitle(snapshot)}. ${who}. ${when}. ${sizeText(snapshot.sizeBytes)}`}
      accessibilityRole="button"
      className="min-h-[64px] flex-row items-center gap-sm border-b border-b-divider-1 px-md py-sm active:opacity-70"
      onPress={() => onPress(snapshot)}
    >
      <IconTile
        name={SNAPSHOT_KIND_ART[snapshot.kind].icon}
        size="sm"
        tone={SNAPSHOT_KIND_ART[snapshot.kind].tone}
      />
      <View className="flex-1 gap-3xs">
        <View className="flex-row items-center gap-xs">
          <Badge
            label={SNAPSHOT_KIND_LABEL[snapshot.kind]}
            size="sm"
            variant={snapshot.kind === 'MANUAL' ? 'brand' : 'neutral'}
          />
        </View>
        {snapshot.label ? (
          <Text className="text-label-lg font-semibold text-fg-1" numberOfLines={2}>
            {snapshot.label}
          </Text>
        ) : null}
        <Text className="text-caption-sm text-fg-2" numberOfLines={1}>
          {who} · {when} · {sizeText(snapshot.sizeBytes)}
        </Text>
      </View>
      <Icon color="fg-2" name="arrow-right-small" size="sm" />
    </Pressable>
  );
}

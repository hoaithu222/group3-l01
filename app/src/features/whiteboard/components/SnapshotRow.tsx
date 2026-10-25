import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { SnapshotView } from '../api/whiteboard.types';
import { SNAPSHOT_KIND_ART, SNAPSHOT_KIND_LABEL } from '../constants/whiteboard.constants';
import { snapshotTitle } from '../utils/whiteboard-format';

export interface SnapshotRowProps {
  /** Có quyền khôi phục → chạm để khôi phục; không thì hàng chỉ đọc. */
  onPress?: (snapshot: SnapshotView) => void;
  snapshot: SnapshotView;
}

/**
 * Một bản lưu (app.md §3): loại (Tự động · Thủ công · Trước khi khôi phục — luôn bằng CHỮ), nhãn, người lưu, giờ và số phần tử. Chạm (khi có quyền
 * khôi phục) → hộp xác nhận khôi phục. Bản tự động không có người lưu ("Hệ thống"). ⚠️ P0 chưa có bản XEM TRƯỚC chỉ đọc của bản lưu (cần dựng canvas từ
 * `yjsState` base64) — người dùng khôi phục dựa vào thời gian, nhãn và số phần tử.
 */
export function SnapshotRow({ onPress, snapshot }: SnapshotRowProps) {
  const who = snapshot.createdBy?.name ?? 'Hệ thống';
  const when = formatDateTime(snapshot.at);
  const label = `${snapshotTitle(snapshot)}. ${who}. ${when}. ${snapshot.elementCount} phần tử`;
  const body = (
    <>
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
          {who} · {when} · {snapshot.elementCount} phần tử
        </Text>
      </View>
      {onPress ? <Icon color="fg-2" name="reload" size="sm" /> : null}
    </>
  );

  if (!onPress) {
    return (
      <View
        accessibilityLabel={label}
        accessible
        className="min-h-[64px] flex-row items-center gap-sm border-b border-b-divider-1 px-md py-sm"
      >
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityHint="Khôi phục bảng về phiên bản này"
      accessibilityLabel={label}
      accessibilityRole="button"
      className="min-h-[64px] flex-row items-center gap-sm border-b border-b-divider-1 px-md py-sm active:opacity-70"
      onPress={() => onPress(snapshot)}
    >
      {body}
    </Pressable>
  );
}

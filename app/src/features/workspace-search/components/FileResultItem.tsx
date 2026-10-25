import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { IconTile } from '@/shared/ui/icon-tile';
import { formatDate } from '@/shared/utils/format/date.utils';

import type { FileHit } from '../api';
import { describeFileKind, formatFileSize, scopeLabel } from '../utils/result-format';

export interface FileResultItemProps {
  hit: FileHit;
  onPress: (hit: FileHit) => void;
}

function sourceLabel(hit: FileHit): string {
  if (hit.source.kind === 'RESOURCE') return 'Trong kho tài liệu';
  return hit.source.scope ? `Trong ${scopeLabel(hit.source.scope)}` : 'Trong tin nhắn';
}

/**
 * Một kết quả TỆP (app.md p5-04 §3): ô icon theo loại (tông riêng cho ảnh/video/âm thanh/tài liệu — `describeFileKind`) · tên ·
 * loại · dung lượng · ngày · nguồn. Chạm → xem trước tài liệu (tệp kho tài liệu) hoặc tin gốc chứa tệp (tệp của tin).
 */
export const FileResultItem = memo(function FileResultItem({ hit, onPress }: FileResultItemProps) {
  const kind = describeFileKind(hit);
  const meta = [kind.label, formatFileSize(hit.size), formatDate(hit.createdAt)]
    .filter(Boolean)
    .join(' · ');
  const source = sourceLabel(hit);

  return (
    <Pressable
      accessibilityHint={hit.source.kind === 'RESOURCE' ? 'Xem trước tệp' : 'Mở tin nhắn chứa tệp'}
      accessibilityLabel={`${hit.name}, ${meta}, ${source}`}
      accessibilityRole="button"
      className="flex-row items-center gap-sm px-md py-sm active:opacity-70"
      onPress={() => onPress(hit)}
    >
      <IconTile name={kind.icon} tone={kind.tone} />

      <View className="flex-1 gap-3xs">
        <Text className="text-label-md font-semibold text-fg-1" numberOfLines={1}>
          {hit.name}
        </Text>
        <Text className="text-caption-sm text-fg-2" numberOfLines={1}>
          {meta}
        </Text>
        <Text className="text-caption-sm text-fg-2" numberOfLines={1}>
          {source}
        </Text>
      </View>
    </Pressable>
  );
});

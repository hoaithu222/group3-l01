import { Pressable, Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';

import { describeItem, itemAccessibilityLabel } from '../utils/describe-item';
import type { ExplorerItem } from '../utils/explorer-items';
import { ResourceThumb } from './ResourceThumb';

export interface ResourceListItemProps {
  item: ExplorerItem;
  onMore: (item: ExplorerItem) => void;
  onPress: (item: ExplorerItem) => void;
}

/**
 * Dòng DANH SÁCH cho thư mục (`FolderRow` của app.md §2, cùng khuôn với tệp) và
 * tệp. Thư mục có mũi tên `›` báo "vào trong"; tệp có thumbnail nếu là ảnh.
 * Kết quả tìm trải toàn workspace nên tệp hiện thêm ĐƯỜNG DẪN thư mục khi BE trả.
 *
 * Nút "⋯" là anh em của vùng bấm chính — xem `ResourceGridItem`.
 */
export function ResourceListItem({ item, onMore, onPress }: ResourceListItemProps) {
  const view = describeItem(item);
  const isFolder = item.kind === 'folder';

  return (
    <View className="flex-row items-center border-b-hairline border-divider-1 pl-md">
      <Pressable
        accessibilityLabel={itemAccessibilityLabel(view)}
        accessibilityRole="button"
        className="min-h-14 flex-1 flex-row items-center gap-sm py-xs active:opacity-70"
        onPress={() => onPress(item)}
      >
        <ResourceThumb
          className="size-4xl rounded-sm"
          icon={view.icon}
          recyclingKey={item.key}
          thumbnailUrl={view.thumbnailUrl}
          tone={view.tone}
        />
        <View className="flex-1 gap-3xs">
          <Text className="text-label-md text-fg-1" ellipsizeMode="tail" numberOfLines={2}>
            {view.title}
          </Text>
          <Text className="text-caption-sm text-fg-2" numberOfLines={1}>
            {view.subtitle}
          </Text>
          {view.path ? (
            <Text className="text-caption-sm text-fg-2" numberOfLines={1}>
              {`Trong: ${view.path}`}
            </Text>
          ) : null}
        </View>
        {isFolder ? <Icon color="fg-2" name="arrow-right-small" size="sm" /> : null}
      </Pressable>
      <Button
        accessibilityLabel={`Thêm thao tác cho ${view.title}`}
        iconLeft="more"
        iconOnly
        size="sm"
        variant="tertiary"
        onPress={() => onMore(item)}
      />
    </View>
  );
}

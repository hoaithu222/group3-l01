import { Pressable, Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';

import { describeItem, itemAccessibilityLabel } from '../utils/describe-item';
import type { ExplorerItem } from '../utils/explorer-items';
import { ResourceThumb } from './ResourceThumb';

export interface ResourceGridItemProps {
  item: ExplorerItem;
  onMore: (item: ExplorerItem) => void;
  onPress: (item: ExplorerItem) => void;
}

/**
 * Ô LƯỚI cho cả thư mục lẫn tệp (app.md p3-01 §2). Nút "⋯" là ANH EM của vùng
 * bấm chính chứ không lồng bên trong: `Pressable` lồng `Pressable` khiến cú
 * chạm vào nút bị vùng ngoài nuốt trên Android.
 *
 * Tên tối đa 2 dòng + "…" (app.md §7); tên đầy đủ nằm trong "Thông tin". Loại
 * tệp là CHỮ ("PDF", "Ảnh"…) cạnh icon, không chỉ là hình.
 */
export function ResourceGridItem({ item, onMore, onPress }: ResourceGridItemProps) {
  const view = describeItem(item);

  return (
    <View className="flex-1 p-xs">
      <View className="overflow-hidden rounded-sm border-hairline border-border-1 bg-bg-1">
        <Pressable
          accessibilityLabel={itemAccessibilityLabel(view)}
          accessibilityRole="button"
          className="active:opacity-80"
          onPress={() => onPress(item)}
        >
          <ResourceThumb
            aspectRatio={4 / 3}
            className="w-full rounded-none"
            icon={view.icon}
            recyclingKey={item.key}
            thumbnailUrl={view.thumbnailUrl}
            tileSize="xl"
            tone={view.tone}
          />
          <View className="gap-3xs px-sm pb-sm pt-xs">
            <Text
              className="min-h-10 pr-xl text-label-md text-fg-1"
              ellipsizeMode="tail"
              numberOfLines={2}
            >
              {view.title}
            </Text>
            <Text className="text-caption-sm text-fg-2" numberOfLines={1}>
              {view.subtitle}
            </Text>
          </View>
        </Pressable>
        <View className="absolute bottom-xs right-3xs">
          <Button
            accessibilityLabel={`Thêm thao tác cho ${view.title}`}
            iconLeft="more"
            iconOnly
            size="xs"
            variant="tertiary"
            onPress={() => onMore(item)}
          />
        </View>
      </View>
    </View>
  );
}

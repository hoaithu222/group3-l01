import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import type { RoadmapMediaDto } from '../../api/roadmap.types';
import { MediaPreview } from './MediaPreview';

export interface MediaRefRowProps {
  description: string | null;
  media: RoadmapMediaDto;
  title: string;
  onOpen?: () => void;
}

/**
 * Lần nhắc LẠI một hình đã vẽ lớn ở phía trên (danh sách "Tài nguyên kèm theo", "Xem … để chi tiết", drill dùng lại
 * mockup của bài tại lớp): dòng gọn có ảnh nhỏ 64 dp + tên + mô tả, chạm để xem toàn màn. Vẽ lại hình lớn ở đây là
 * thêm nửa màn hình cho đúng thứ người học vừa xem xong.
 */
export function MediaRefRow({ description, media, onOpen, title }: MediaRefRowProps) {
  const label = description ? `${title}. ${description}` : title;

  return (
    <Pressable
      accessibilityHint={onOpen ? 'Mở toàn màn hình để phóng to' : undefined}
      accessibilityLabel={label}
      accessibilityRole={onOpen ? 'imagebutton' : 'image'}
      disabled={!onOpen}
      onPress={onOpen}
    >
      {({ pressed }) => (
        <View
          className={cn(
            'flex-row items-center gap-sm rounded-md border border-border-1 p-xs',
            pressed ? 'bg-bg-3' : 'bg-bg-1',
          )}
        >
          <View className="size-6xl overflow-hidden rounded-xs">
            <MediaPreview alt={label} decorative fill media={media} />
          </View>
          <View className="flex-1 gap-3xs">
            <Text className="text-label-md font-semibold text-fg-1" numberOfLines={2}>
              {title}
            </Text>
            {description ? (
              <Text className="text-caption-lg text-fg-2" numberOfLines={2}>
                {description}
              </Text>
            ) : null}
          </View>
          {onOpen ? <Icon color="fg-2" name="arrow-right-small" size="sm" /> : null}
        </View>
      )}
    </Pressable>
  );
}

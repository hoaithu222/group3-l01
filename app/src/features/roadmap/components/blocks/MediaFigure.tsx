import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import type { RoadmapMediaDto } from '../../api/roadmap.types';
import { MediaPreview } from './MediaPreview';

/**
 * Trần chiều cao của hình trong bài (dp): mockup giáo trình là khổ DỌC (900×1500 → cao ~550 dp nếu vẽ đủ bề ngang máy
 * 360) — 420 vẫn thấy trọn bố cục mà chữ quanh hình không bị đẩy khỏi màn.
 */
const FIGURE_MAX_HEIGHT = 420;

export interface MediaFigureProps {
  description: string | null;
  media: RoadmapMediaDto;
  title: string;
  onOpen?: () => void;
}

/**
 * Hình minh hoạ LỚN ngay trong bài (lần nhắc ĐẦU của một mockup): khung ảnh co theo tỉ lệ + nhãn "Phóng to" + tiêu
 * đề/mô tả. Chạm cả khối để xem toàn màn — mockup có chữ 12–14px trên khổ 1100px, co vừa bề ngang điện thoại chỉ còn
 * ~4px: đủ nhìn tổng thể, muốn đọc chi tiết phải phóng to.
 *
 * ✅ Thay cho dòng chữ "code/x-mockup.svg — mở trong trình duyệt để xem…" của bản trước: đường dẫn tệp không mở được
 * trong app, người học phải tự đi tìm tab Hình ảnh.
 */
export function MediaFigure({ description, media, onOpen, title }: MediaFigureProps) {
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
        <View className={cn('overflow-hidden rounded-md border border-border-1', pressed ? 'bg-bg-3' : 'bg-bg-1')}>
          <View className="p-xs">
            <MediaPreview alt={label} decorative maxHeight={FIGURE_MAX_HEIGHT} media={media} />
            {onOpen ? (
              <View className="absolute right-sm top-sm flex-row items-center gap-3xs rounded-full border border-border-1 bg-bg-1 px-xs py-3xs">
                <Icon color="fg-2" name="search" size="xs" />
                <Text className="text-caption-sm text-fg-2">Phóng to</Text>
              </View>
            ) : null}
          </View>
          <View className="gap-3xs px-sm pb-sm">
            <Text className="text-label-md font-semibold text-fg-1">{title}</Text>
            {description ? <Text className="text-caption-lg text-fg-2">{description}</Text> : null}
          </View>
        </View>
      )}
    </Pressable>
  );
}

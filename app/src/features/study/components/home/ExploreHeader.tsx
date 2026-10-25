import { ScrollView, Text, View } from 'react-native';

import { Chip } from '@/shared/ui/chip';
import { IconTile } from '@/shared/ui/icon-tile';
import { hapticSelection } from '@/shared/utils/haptics';

import type { PopularTag } from '../../api/study.types';

export interface ExploreHeaderProps {
  /** Đang tìm/lọc ⇒ ẩn khối giới thiệu (kết quả lên ngay đầu), dải thẻ lọc vẫn còn để đổi/bỏ lọc. */
  filtering: boolean;
  /** Thẻ đang lọc (`undefined` = không lọc). */
  selectedTag: string | undefined;
  tags: readonly PopularTag[] | undefined;
  onSelectTag: (tag: string | undefined) => void;
}

/**
 * Khối ĐẦU danh sách của tab "Khám phá" (cuộn CÙNG danh sách bộ, không chiếm hàng cố định): dải chip thẻ phổ biến + giới thiệu
 * gọn "Bộ học từ cộng đồng". Tách khỏi `StudyHomeScreen` để màn đó giữ dưới 200 dòng.
 *
 * ⚠️ Giới thiệu là MỘT hàng (ô icon + hai dòng chữ), ⛔ không `ModuleBanner` 96dp: trước đây khối cố định ăn quá nửa chỗ của tab.
 * Ô icon tông `info` = màu phạm vi "Công khai" ở thẻ bộ học. Chạm chip là đổi bộ lọc ⇒ rung `hapticSelection`.
 */
export function ExploreHeader({ filtering, onSelectTag, selectedTag, tags }: ExploreHeaderProps) {
  return (
    <>
      {tags && tags.length > 0 ? (
        <ScrollView
          // ⚠️ Dải lọc nằm trong ListHeaderComponent, không chiếm một hàng cố định trên kết quả.
          // ✅ `contentContainerClassName` (NativeWind 4 nối sẵn cho `ScrollView`) thay cho `contentContainerStyle` + `SPACING`:
          // giãn cách viết bằng lớp token như mọi chỗ khác, không còn một bộ số thô song song.
          className="grow-0"
          contentContainerClassName="items-center gap-xs px-md py-2xs"
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          {tags.map((item) => (
            <Chip
              key={item.tag}
              label={`#${item.tag}`}
              selected={selectedTag === item.tag}
              onPress={() => {
                hapticSelection();
                onSelectTag(selectedTag === item.tag ? undefined : item.tag);
              }}
            />
          ))}
        </ScrollView>
      ) : null}
      {filtering ? null : (
        <View className="flex-row items-center gap-sm px-md py-xs">
          <IconTile name="share" size="sm" tone="info" />
          <View className="flex-1 gap-2xs">
            <Text accessibilityRole="header" className="text-label-lg font-semibold text-fg-1">
              Bộ học từ cộng đồng
            </Text>
            <Text className="text-caption-lg text-fg-2">
              Thẻ ghi nhớ, trắc nghiệm do mọi người chia sẻ — sao chép về học ngay.
            </Text>
          </View>
        </View>
      )}
    </>
  );
}

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Chip } from '@/shared/ui/chip';
import { Icon } from '@/shared/ui/icon';

import type { DraftItem } from '../../utils/editor-draft';
import { PreviewBody } from './PreviewBody';

export interface ItemPreviewProps {
  item: DraftItem;
}

/**
 * Xem trước NGAY mục đang soạn, đúng như người học sẽ thấy: thẻ ghi nhớ có hai mặt ("Mặt trước"/"Mặt sau"), các dạng còn lại có hai
 * trạng thái ("Đề bài" — chưa biết đáp án, "Đáp án" — lựa chọn đúng có dấu tích + chữ). Cập nhật theo từng phím gõ vì đọc thẳng nháp.
 *
 * Thu gọn được (mặc định MỞ): khi bàn phím che nửa màn, người soạn thu nó lại để thấy ô đang gõ; trạng thái mở/đóng chỉ là của
 * lần mở form này (không lưu) — không có gì đáng nhớ giữa hai mục.
 */
export function ItemPreview({ item }: ItemPreviewProps) {
  const [open, setOpen] = useState(true);
  const [answer, setAnswer] = useState(false);
  const flashcard = item.type === 'FLASHCARD';

  return (
    <View className="overflow-hidden rounded-md border-hairline border-border-1 bg-bg-1">
      <Pressable
        accessibilityLabel={
          open ? 'Xem trước, đang mở. Chạm để thu gọn' : 'Xem trước, đang thu gọn. Chạm để mở'
        }
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="min-h-[44px] flex-row items-center gap-xs px-sm active:opacity-70"
        onPress={() => setOpen((current) => !current)}
      >
        <Icon color="fg-2" name="view" size={20} />
        <Text className="flex-1 text-label-md font-semibold text-fg-1">
          Xem trước · như người học thấy
        </Text>
        <Icon color="fg-2" name={open ? 'arrow-up-small' : 'arrow-down-small'} size={20} />
      </Pressable>
      {open ? (
        <View className="gap-sm border-t border-t-divider-1 p-sm">
          <View accessibilityRole="radiogroup" className="flex-row gap-xs">
            <Chip
              label={flashcard ? 'Mặt trước' : 'Đề bài'}
              role="radio"
              selected={!answer}
              size="sm"
              onPress={() => setAnswer(false)}
            />
            <Chip
              label={flashcard ? 'Mặt sau' : 'Đáp án'}
              role="radio"
              selected={answer}
              size="sm"
              onPress={() => setAnswer(true)}
            />
          </View>
          <PreviewBody item={item} showAnswer={answer} />
        </View>
      ) : null}
    </View>
  );
}

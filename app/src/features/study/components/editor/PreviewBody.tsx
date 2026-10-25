import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import type { DraftItem } from '../../utils/editor-draft';
import { StudyAssetImage } from '../StudyAssetImage';
import { PreviewChoices } from './PreviewChoices';

export interface PreviewBodyProps {
  item: DraftItem;
  /** Mặt sau của thẻ ghi nhớ / mặt "Đáp án" của các dạng còn lại. */
  showAnswer: boolean;
}

/**
 * Nội dung bản xem trước: chữ (câu hỏi hoặc mặt thẻ), ảnh, ghi chú "có âm thanh" và phần lựa chọn. Chỉ dùng DỮ LIỆU NHÁP — gõ tới
 * đâu thấy tới đó, không chờ lưu. Âm thanh không phát ở đây (nút nghe thử nằm ở ô âm thanh của form); ảnh của lựa chọn cũng không
 * tải lại lần nữa (mỗi ảnh là một URL ký xin riêng) — người soạn xem ảnh ngay tại ô của nó.
 */
export function PreviewBody({ item, showAnswer }: PreviewBodyProps) {
  const flashcard = item.type === 'FLASHCARD';
  const back = flashcard && showAnswer;
  const text = (back ? item.answerText : item.prompt).trim();
  const placeholder = back
    ? 'Định nghĩa sẽ hiện ở đây'
    : flashcard
      ? 'Thuật ngữ sẽ hiện ở đây'
      : 'Câu hỏi sẽ hiện ở đây';
  const image = back ? item.backMediaAssetId : item.frontMediaAssetId;
  const explanation = !flashcard && showAnswer ? item.explanation.trim() : '';

  return (
    <View className="gap-sm">
      <Text
        className={cn(
          flashcard ? 'text-center text-header-sm font-semibold' : 'text-body-lg',
          text ? 'text-fg-1' : 'text-fg-2',
        )}
      >
        {text || placeholder}
      </Text>
      {image ? <StudyAssetImage alt="Ảnh minh hoạ trong bản xem trước" assetId={image} /> : null}
      {item.audioAssetId ? (
        <View className="flex-row items-center justify-center gap-3xs">
          <Icon color="fg-2" name="audio" size={16} />
          <Text className="text-caption-sm text-fg-2">Có âm thanh kèm theo</Text>
        </View>
      ) : null}
      <PreviewChoices item={item} showAnswer={showAnswer} />
      {explanation ? (
        <View className="gap-3xs rounded-sm bg-bg-2 p-sm">
          <Text className="text-label-sm font-semibold text-fg-1">Giải thích</Text>
          <Text className="text-body-md text-fg-1">{explanation}</Text>
        </View>
      ) : null}
    </View>
  );
}

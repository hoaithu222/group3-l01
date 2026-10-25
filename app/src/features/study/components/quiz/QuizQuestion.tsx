import { Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';

import type { StudyItemDto } from '../../api/study.types';
import { ITEM_TYPE_META, MATCH_MODE_LABELS } from '../../constants/study.constants';
import { StudyAssetImage } from '../StudyAssetImage';
import { StudyAudioButton } from '../StudyAudioButton';

/** Gợi ý cách trả lời bằng CHỮ theo loại câu (không chỉ hình ô tròn/vuông của đáp án). Câu điền nêu luôn luật so khớp — hoa/thường, dấu có tính không. */
function answerHint(item: StudyItemDto): string {
  switch (item.type) {
    case 'MULTI_SELECT':
      return 'Chọn tất cả đáp án đúng';
    case 'FILL_BLANK':
      return `Nhập câu trả lời · ${MATCH_MODE_LABELS[item.matchMode].toLowerCase()}`;
    default:
      return 'Chọn một đáp án';
  }
}

/**
 * Đề của một câu Quiz nhanh: nhãn loại câu, thẻ đề bài (kèm ảnh mặt trước + nút âm thanh nếu có) và dòng gợi ý cách trả lời. Ảnh/âm thanh đi qua
 * `StudyAssetImage`/`StudyAudioButton` (URL ký ngắn hạn, phát lúc bấm). `key` theo mục: sang câu khác là trình phát/ảnh mới, không phát lẫn.
 */
export function QuizQuestion({ item }: { item: StudyItemDto }) {
  const meta = ITEM_TYPE_META[item.type];

  return (
    <View className="gap-sm">
      <View className="flex-row">
        <Badge label={meta.label} variant="info" />
      </View>
      <Card className="gap-sm">
        {item.frontMediaAssetId ? (
          <StudyAssetImage alt="Ảnh của câu hỏi" assetId={item.frontMediaAssetId} />
        ) : null}
        <Text accessibilityRole="header" className="text-header-sm text-fg-1">
          {item.prompt}
        </Text>
        {item.audioAssetId ? (
          <View className="flex-row">
            <StudyAudioButton key={item.id} assetId={item.audioAssetId} label="Nghe câu hỏi" />
          </View>
        ) : null}
      </Card>
      <View className="flex-row items-center gap-xs">
        <Icon color="fg-2" name="alert-information" size={16} />
        <Text className="flex-1 text-label-md text-fg-2">{answerHint(item)}</Text>
      </View>
    </View>
  );
}

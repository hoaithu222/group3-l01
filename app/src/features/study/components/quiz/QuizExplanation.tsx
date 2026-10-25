import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';

import { StudyAssetImage } from '../StudyAssetImage';

export interface QuizExplanationProps {
  /** Ảnh mặt sau của mục (nếu tác giả gắn) — minh hoạ cho lời giải. */
  imageAssetId: string | null;
  text: string;
}

/** Lời giải thích của tác giả (`explanation`), hiện dưới các đáp án SAU khi chấm — để người học hiểu VÌ SAO, không chỉ biết đúng/sai. */
export function QuizExplanation({ imageAssetId, text }: QuizExplanationProps) {
  return (
    <Card className="gap-xs">
      <View className="flex-row items-center gap-xs">
        <Icon color="fg-brand" name="alert-help" size={20} variant="twotone" />
        <Text accessibilityRole="header" className="text-label-lg text-fg-1">
          Giải thích
        </Text>
      </View>
      {imageAssetId ? <StudyAssetImage alt="Ảnh minh hoạ lời giải" assetId={imageAssetId} /> : null}
      <Text className="text-body-md text-fg-1">{text}</Text>
    </Card>
  );
}

import { View } from 'react-native';

import { Button } from '@/shared/ui/button';

import { ActionTile } from './ActionTile';

export interface FlashcardControlsProps {
  canPrevious: boolean;
  onKnown: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onUnknown: () => void;
}

/**
 * Điều khiển dưới thẻ (app.md p4-01 §3 `FlashcardDeckControls`) — cũng là ĐƯỜNG THAY THẾ cho cử chỉ vuốt (người dùng một tay,
 * trình đọc màn hình, không vuốt được): "Chưa thuộc"/"Đã thuộc" chấm rồi tự sang thẻ kế (thẻ bay ra như khi vuốt — cùng một
 * lối `useDeckSwipe.dismiss`), "Trước/Sau" duyệt thẻ mà KHÔNG chấm. "Đã thuộc" là ô ĐẶC duy nhất (hành động chính), "Chưa thuộc"
 * là ô nhạt cùng tông với lớp phủ vuốt trái — màu khớp giữa nút và cử chỉ, nhưng chữ luôn có (màu không phải kênh duy nhất).
 * "Xáo trộn" là công tắc ở dòng tiến độ phía trên, không phải nút thứ năm ở đây.
 *
 * Máy nằm ngang: cột điều khiển hẹp nên hai ô chấm xếp DỌC (`landscape:flex-col`) thay vì chen nhau trong 130dp.
 */
export function FlashcardControls({
  canPrevious,
  onKnown,
  onNext,
  onPrevious,
  onUnknown,
}: FlashcardControlsProps) {
  return (
    <View className="gap-sm">
      <View className="flex-row gap-sm landscape:flex-col">
        <ActionTile
          className="flex-1 landscape:flex-none"
          icon="reload"
          label="Chưa thuộc"
          tone="warning"
          onPress={onUnknown}
        />
        <ActionTile
          className="flex-1 landscape:flex-none"
          icon="checkmark-circle"
          label="Đã thuộc"
          solid
          tone="success"
          onPress={onKnown}
        />
      </View>
      <View className="flex-row gap-sm">
        <View className="flex-1">
          <Button
            accessibilityLabel="Thẻ trước"
            disabled={!canPrevious}
            fullWidth
            iconLeft="arrow-left-small"
            label="Trước"
            variant="tertiary"
            onPress={onPrevious}
          />
        </View>
        <View className="flex-1">
          <Button
            accessibilityLabel="Thẻ sau"
            fullWidth
            iconRight="arrow-right-small"
            label="Sau"
            variant="tertiary"
            onPress={onNext}
          />
        </View>
      </View>
    </View>
  );
}

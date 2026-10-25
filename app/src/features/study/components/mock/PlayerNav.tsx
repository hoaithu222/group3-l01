import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';

import { tapHaptic } from '../../utils/mock-haptics';

export interface PlayerNavProps {
  index: number;
  onGo: (index: number) => void;
  total: number;
}

/**
 * Trước / Sau — nội dung của THANH ĐÁY `BottomActionBar` (nơi gọi bọc), để chuyển câu luôn nằm trong tầm ngón cái thay vì
 * trôi cuối vùng cuộn khi câu hỏi dài. "Sau" là nút chính của màn (tông `info` — bản sắc Thi thử); "Nộp bài" ở thanh
 * tiêu đề, MỘT chỗ duy nhất — nên ở CÂU CUỐI (khi "Sau" khoá) có một dòng nhắc bước tiếp theo là nộp bài. Chuyển câu rung
 * nhẹ (`tapHaptic`). Nút "Đánh dấu xem lại" nằm cạnh số câu trong `QuestionView` (app.md p4-02 §2 `QuestionNavGrid`).
 */
export function PlayerNav({ index, onGo, total }: PlayerNavProps) {
  const last = index >= total - 1;
  const go = (next: number) => {
    tapHaptic();
    onGo(next);
  };
  return (
    <View className="gap-xs">
      {last ? (
        <Text className="text-center text-label-md text-fg-2">
          Đây là câu cuối — bấm “Nộp bài” ở góc trên khi bạn đã xong.
        </Text>
      ) : null}
      <View className="flex-row gap-xs">
        <View className="flex-1">
          <Button
            disabled={index === 0}
            fullWidth
            iconLeft="arrow-left-small"
            label="Trước"
            variant="info-secondary"
            onPress={() => go(index - 1)}
          />
        </View>
        <View className="flex-1">
          <Button
            disabled={last}
            fullWidth
            iconRight="arrow-right-small"
            label="Sau"
            variant="info"
            onPress={() => go(index + 1)}
          />
        </View>
      </View>
    </View>
  );
}

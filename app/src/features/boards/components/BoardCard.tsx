import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';

import type { BoardSummary } from '../api/boards.types';
import { percentDone } from '../utils/task-format';

/**
 * Thẻ bảng trong danh sách (`app.md` §3 `BoardCard`): tên, số cột/thẻ, % hoàn
 * thành. Tiến độ vẽ bằng thanh + CHỮ "% hoàn thành" — màu không phải dấu hiệu
 * duy nhất. Chạm cả thẻ để mở (`Card onPress` đã có phản hồi chạm).
 *
 * Ô icon `checkmark-square` tông `success` — cùng nhận diện với lối vào "Việc" ở hub nhóm (`BoardsHubCard`); bảng xong hết
 * thẻ đổi sang `checkmark-circle` cho thấy "đã về đích" ngay từ danh sách. Mũi tên `›` báo "mở ra" (trang trí).
 */
export function BoardCard({ board, onPress }: { board: BoardSummary; onPress: () => void }) {
  const percent = percentDone(board);
  const finished = board.taskCount > 0 && percent === 100;

  return (
    <Card onPress={onPress}>
      <View className="flex-row items-center gap-sm">
        <IconTile name={finished ? 'checkmark-circle' : 'checkmark-square'} tone="success" />
        <View className="flex-1 gap-3xs">
          <Text className="text-label-lg font-semibold text-fg-1" numberOfLines={2}>
            {board.name}
          </Text>
          <Text className="text-body-md text-fg-2">{`${board.columns.length} cột · ${board.taskCount} thẻ`}</Text>
        </View>
        <Icon color="fg-2" name="arrow-right-small" size="sm" />
      </View>
      <View className="gap-3xs">
        <View className="h-2 overflow-hidden rounded-full bg-bg-3">
          <View className="h-2 rounded-full bg-action-success" style={{ width: `${percent}%` }} />
        </View>
        <Text className="text-caption-sm text-fg-2">{`${percent}% hoàn thành (${board.doneCount}/${board.taskCount})`}</Text>
      </View>
    </Card>
  );
}

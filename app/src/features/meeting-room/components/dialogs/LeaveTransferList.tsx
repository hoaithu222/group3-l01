import { View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Icon } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';

import type { RoomPerson } from '../../utils/room-people.utils';

export interface LeaveTransferListProps {
  /** Người có thể nhận quyền: người thường đang trong phòng (cha lọc — không phải mình, không phải chủ trì/đồng chủ trì). */
  candidates: readonly RoomPerson[];
  selectedId: string | null;
  onSelect: (userId: string) => void;
}

/**
 * Chọn MỘT người để giao quyền trước khi rời (app.md p2-05 §3.2 `LeaveMeetingDialog`). Chọn xong còn một bước xác nhận riêng ("Rời và giao
 * quyền") — chạm nhầm một hàng không rời phòng ngay. Trạng thái "đang chọn" đi bằng `selected` (cho trình đọc màn hình) VÀ dấu tích kèm nhãn
 * — không chỉ nền tint.
 */
export function LeaveTransferList({ candidates, selectedId, onSelect }: LeaveTransferListProps) {
  return (
    <View>
      {candidates.map((person, index) => {
        const selected = person.userId === selectedId;
        return (
          <ListItem
            key={person.userId}
            divider={index < candidates.length - 1}
            label={person.name}
            leading={<Avatar name={person.name} size="sm" />}
            selected={selected}
            trailing={selected ? <Icon color="fg-brand" label="Đang chọn" name="checkmark-circle" /> : undefined}
            onPress={() => onSelect(person.userId)}
          />
        );
      })}
    </View>
  );
}

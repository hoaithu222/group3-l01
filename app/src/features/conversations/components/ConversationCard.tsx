import { View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { cn } from '@/shared/utils/style/cn';

import {
  ConversationSwipeActions,
  type ConversationSwipeActionsProps,
} from './ConversationSwipeActions';

export type ConversationCardProps = ConversationSwipeActionsProps;

/**
 * Một hội thoại dạng THẺ trong danh sách (màn chính, "Đã ghim", "Đã lưu trữ"): lề 16 hai bên, khe 8 giữa hai thẻ — nền màn
 * (`bg-base`) lộ ra GIỮA các thẻ nên mỗi hội thoại tách thành một khối, thay vì các hàng trần dính liền nhau trên cùng một nền.
 * Đây chỉ là KHUNG; màu thân thẻ (chưa đọc / đang mở / đang bấm) ở `ConversationRow`.
 *
 * ⚠️ Khung (`Card`) đứng NGOÀI phần vuốt và mang `overflow-hidden`: nó cắt cả thân thẻ lẫn các nút vuốt lộ ra phía sau theo CÙNG
 * đường bo 24. Bo góc đặt lên thân thẻ (phần trượt theo ngón tay) thì nút vuốt lộ ra là các khối vuông cạnh một thẻ tròn.
 * ⚠️ Khe 8 là `pb-xs` của khối BỌC, ⛔ không phải `mb-*`/`gap` bên trong khung: `Swipeable` vẽ nút vuốt cao bằng CẢ khối con —
 * khe nằm trong khung là nút vuốt lòi xuống khe.
 * Viền mảnh vì thẻ trắng và nền màn chỉ chênh ~1.1:1 ở chế độ sáng: viền giữ mép thẻ rõ trên mọi độ sáng màn hình. Máy tính
 * bảng: thẻ đang mở viền thương hiệu — cùng ngôn ngữ với chip đang chọn (`border-brand`).
 */
export function ConversationCard({ active = false, ...props }: ConversationCardProps) {
  return (
    <View className="px-md pb-xs">
      <Card
        className={cn(
          'gap-0 overflow-hidden border-hairline',
          active ? 'border-border-brand' : 'border-border-1',
        )}
        padded={false}
      >
        <ConversationSwipeActions active={active} {...props} />
      </Card>
    </View>
  );
}

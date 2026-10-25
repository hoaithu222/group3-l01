import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { Toggle } from '@/shared/ui/toggle';
import { hapticSelection } from '@/shared/utils/haptics';

export interface MeToggleRowProps {
  description?: string;
  disabled?: boolean;
  /** Mặc định BẬT vì hàng thường nằm trong `MeNavGroup` (cắt vạch thừa ở hàng cuối). Hàng đứng cuối một thẻ tự dựng thì tắt. */
  divider?: boolean;
  icon: IconName;
  label: string;
  onChange: (value: boolean) => void;
  tone?: IconTileTone;
  value: boolean;
}

/**
 * Hàng công tắc dùng chung của Cài đặt / Quyền riêng tư / Thông báo: ô icon có tông · tiêu đề · mô tả · công tắc — cùng
 * khuôn với `MeNavRow` nên hai loại hàng đứng chung một thẻ vẫn thẳng cột.
 *
 * `items-center`: `ListItem` mặc định `items-start` cho hàng KHÔNG bấm được (để nhãn thẳng với dòng đầu của giá trị nhiều
 * dòng) — ở đây không có giá trị nên ô icon và công tắc phải canh giữa theo khối chữ, kể cả khi mô tả xuống hai dòng.
 *
 * ⚠️ Chạm vào CÔNG TẮC mới đổi được (hàng không có `onPress`): hàng chữ + icon không phải nút, tránh bấm nhầm khi cuộn.
 * Công tắc có `hitSlop` ±12dp nên vẫn đủ ngưỡng chạm 44dp.
 */
export function MeToggleRow({
  description,
  disabled = false,
  divider = true,
  icon,
  label,
  onChange,
  tone = 'brand',
  value,
}: MeToggleRowProps) {
  return (
    <ListItem
      className="items-center py-xs"
      description={description}
      divider={divider}
      emphasis="title"
      label={label}
      leading={<IconTile name={icon} tone={tone} />}
      trailing={
        <Toggle
          accessibilityLabel={label}
          disabled={disabled}
          value={value}
          // Rung "đổi lựa chọn" TRƯỚC khi gọi nơi xử lý (thường là một `mutate`) — phản hồi tức thì của cú chạm, không chờ mạng.
          onChange={(next) => {
            hapticSelection();
            onChange(next);
          }}
        />
      }
    />
  );
}

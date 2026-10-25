import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

export interface MemberActionRowProps {
  /** Dòng phụ dưới nhãn — nhất là LÝ DO khi hàng bị khoá (`disabled`), để người dùng biết vì sao không bấm được. */
  description?: string;
  disabled?: boolean;
  /** Kẻ ngăn dưới hàng. Nơi gọi tính theo hàng ĐANG HIỆN (bỏ ở hàng cuối) — hàng không tự biết mình đứng cuối. */
  divider?: boolean;
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Tông ô icon — mặc định suy từ `icon` (`ICON_TONE`); `tone="danger"` luôn đè thành đỏ. */
  tileTone?: IconTileTone;
  /** Nguy hiểm (Loại/Chặn) tô màu cảnh báo — README §7: "nút nguy hiểm màu cảnh báo + chữ". */
  tone?: 'default' | 'danger';
}

/**
 * Tông ô icon theo VIỆC (suy từ icon): cùng một việc mang cùng một màu ở mọi tấm của feature (Nhắn tin luôn `brand`, Mời qua
 * email luôn `info`…) mà nơi gọi không phải nhớ truyền. Icon không có trong bảng ⇒ `neutral` (việc phụ/cấu hình).
 * ⛔ `danger` KHÔNG nằm ở đây — chỉ bật qua `tone="danger"` cho việc phá huỷ (Loại · Chặn).
 */
const ICON_TONE: Partial<Record<IconName, IconTileTone>> = {
  'alert-warning': 'warning',
  'chat-bubble': 'brand',
  email: 'info',
  link: 'brand',
  notification: 'info',
  phone: 'success',
  'shield-user': 'warning',
  'user-add': 'success',
  'user-edit': 'accent',
};

/**
 * Một hàng hành động trong `MemberCardSheet` / `InviteMethodSheet` (Nhắn tin/Gọi/Nhắc tên/Đổi vai trò/Loại/Chặn…): lớp mỏng trên
 * `ListItem` chung — `emphasis="title"` (nhãn chữ chính) hoặc `"danger"` (nhãn đỏ), ô icon có tông `IconTile` 32 ở khe `leading`.
 *
 * ⚠️ Bản cũ là `Pressable` tự dựng với lý do "`ListItem` chỉ là hàng nhãn–giá trị hai cột" — không còn đúng: `ListItem` có `emphasis`
 * cho hàng hành động một cột, kẻ ngăn, trạng thái khoá bằng MÀU CHỮ (`action-disabled-fg`; bản cũ `opacity-50` làm mờ luôn ô icon) kèm
 * `description` nói lý do, phản hồi chạm và vùng chạm ≥ 44dp. Tự dựng là lệch nhịp với mọi menu khác của app (`ActionMenuSheet`).
 * ⛔ Không tự khai `px-*`: lề 16 do thân tấm `padded` hoặc `SheetList` (tấm `padded={false}`) lo — thêm nữa là thụt 32dp.
 */
export function MemberActionRow({
  description,
  disabled,
  divider,
  icon,
  label,
  onPress,
  tileTone,
  tone = 'default',
}: MemberActionRowProps) {
  const danger = tone === 'danger';

  return (
    <ListItem
      description={description}
      disabled={disabled}
      divider={divider}
      emphasis={danger ? 'danger' : 'title'}
      label={label}
      labelNumberOfLines={1}
      leading={
        <IconTile
          name={icon}
          size="sm"
          tone={danger ? 'danger' : (tileTone ?? ICON_TONE[icon] ?? 'neutral')}
        />
      }
      onPress={onPress}
    />
  );
}

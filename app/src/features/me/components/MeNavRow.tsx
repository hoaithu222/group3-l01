import { View } from 'react-native';

import { Sparkles } from '@/shared/ui';
import { Icon, type IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

export interface MeNavRowProps {
  /** Dòng phụ dưới tiêu đề — nói hàng này dẫn tới đâu. */
  description?: string;
  /** Hàng dẫn tới việc PHÁ HUỶ/không hoàn tác (Xoá tài khoản): tiêu đề + ô icon đỏ. */
  danger?: boolean;
  icon: IconName;
  label: string;
  onPress: () => void;
  /**
   * Điểm nhấn TĨNH cho lối vào "phần thưởng" (Thành tích): một ngôi sao nhỏ đứng yên ở góc ô icon. ⛔ Không vòng lặp — màn
   * Tôi đã tiêu quỹ "một vòng lặp nổi bật" cho quầng sáng của thẻ hồ sơ. Trang trí thuần: nghĩa nằm ở chữ của hàng.
   */
  sparkle?: boolean;
  /** Tông ô icon. Mặc định `brand`; các hàng cạnh nhau nên xoay tông cho sinh động (xem `IconTile`). ⚠️ `danger` đè tông này. */
  tone?: IconTileTone;
}

/**
 * Hàng điều hướng dùng chung của các màn Tôi / Cài đặt / Thông báo: ô icon có tông · tiêu đề · mô tả · mũi tên. Gom vào
 * MỘT chỗ để mọi hàng cùng khuôn (chữ luôn thẳng cột) — thêm một lối vào mới chỉ là một dòng khai báo.
 *
 * ── Kích thước ────────────────────────────────────────────────────────────
 * Ô icon 40dp (`md`) + `py-xs` 8dp mỗi bên ⇒ hàng cao ≥ 56dp, vượt xa ngưỡng chạm 44dp. `emphasis` đặt THẲNG ở đây (thay vì trông vào
 * `ListItemDefaultsProvider` của nơi gọi) để hàng đứng ở màn nào cũng có tiêu đề là chữ chính, mô tả là chữ phụ.
 *
 * `divider` luôn bật: hàng CUỐI của nhóm để `MeNavGroup` cắt vạch thừa, vì các hàng do feature khác đăng ký qua khe
 * `ProfileRowsSlot` cũng tự mang `divider` và nơi gọi không biết hàng nào là hàng cuối.
 *
 * Mũi tên thuần trang trí (ý "mở ra" đã nằm ở vai `button` của cả hàng) nên `Icon` không có `label`, tự ẩn khỏi
 * trình đọc màn hình. `fg-2` chứ không `fg-3`: mũi tên là dấu hiệu "bấm được", `fg-3` chỉ 2.96:1 trên thẻ trắng.
 */
export function MeNavRow({
  danger = false,
  description,
  icon,
  label,
  onPress,
  sparkle = false,
  tone = 'brand',
}: MeNavRowProps) {
  const tile = <IconTile name={icon} tone={danger ? 'danger' : tone} />;

  return (
    <ListItem
      className="py-xs"
      description={description}
      divider
      emphasis={danger ? 'danger' : 'title'}
      label={label}
      leading={
        sparkle ? (
          <View>
            {tile}
            {/* `active={false}`: sao đứng yên (không loé). ⚠️ Khung lệch lên-phải (`-top-1.5 left-1 -right-1`), KHÔNG
                `-inset-*`: `MeNavGroup` cắt `overflow-hidden` sát mép TRÁI ô icon ⇒ sao tràn sang trái là mất nửa. */}
            <Sparkles
              active={false}
              className="-right-1 -top-1.5 bottom-1.5 left-1"
              count={1}
              size={10}
            />
          </View>
        ) : (
          tile
        )
      }
      trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
      onPress={onPress}
    />
  );
}

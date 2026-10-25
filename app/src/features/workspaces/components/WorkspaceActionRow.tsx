import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Icon, type IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { cn } from '@/shared/utils/style/cn';

export interface WorkspaceActionRowProps {
  /** Số chưa đọc của phân hệ đích (vd "Kênh") — `undefined`/`0` thì không vẽ huy hiệu. Đứng TRƯỚC mũi tên. */
  badge?: number;
  /** Mũi tên `>` cuối dòng — bật cho dòng MỞ MỘT MÀN KHÁC; tắt cho dòng chạy hành động tại chỗ (xác nhận rồi làm). */
  chevron?: boolean;
  description?: string;
  disabled?: boolean;
  /** Kẻ mảnh dưới dòng — bật cho mọi dòng TRỪ dòng cuối của khung. */
  divider?: boolean;
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Tông ô icon — mặc định suy từ `tone` (brand → brand · danger → danger · default → neutral); khối lối vào truyền tông khác nhau cho sinh động. */
  tileTone?: IconTileTone;
  /**
   * `brand` — lối vào (icon màu thương hiệu) · `default` — hành động thường (icon xám) · `danger` — phá huỷ/khó hoàn tác: chữ +
   * icon đỏ, KHÔNG dùng nút viền đỏ chiếm cả bề ngang.
   */
  tone?: 'brand' | 'danger' | 'default';
}

const TILE_TONE = { brand: 'brand', danger: 'danger', default: 'neutral' } as const;

/**
 * Một dòng bấm được của tổng quan nhóm và Cài đặt nhóm: icon + TÊN (đậm màu, dòng chính) + mô tả (mờ hơn, dòng phụ) + mũi tên.
 *
 * ⚠️ Vì sao không dùng `ListItem` chung: nó là hàng NHÃN–GIÁ TRỊ nên nhãn luôn xám (`text-fg-2`) — cạnh mô tả cũng xám thì tên
 * và mô tả cùng một tông, không dòng nào nổi hơn dòng nào; và nó chỉ tô màu phần GIÁ TRỊ theo `tone` nên không làm được nhãn
 * "Rời nhóm" đỏ. `MemberActionRow` (members) và `InfoActionRow` (conversations) là cùng dạng nhưng nằm ở feature khác —
 * `feature-structure.md` cấm import chéo. Ba bản này nên được gộp lên `src/shared/ui` (kèm biến thể nhãn đậm cho `ListItem`).
 *
 * Đặt trong `<Card>` mặc định (có đệm 16): kẻ chia của các dòng thụt vào 16 hai bên, đúng mẫu khối lối vào ở `MeScreen`.
 */
export function WorkspaceActionRow({
  badge,
  chevron = false,
  description,
  disabled = false,
  divider = false,
  icon,
  label,
  onPress,
  tileTone,
  tone = 'default',
}: WorkspaceActionRowProps) {
  const danger = tone === 'danger';

  return (
    <Pressable
      accessibilityLabel={[description ? `${label}. ${description}` : label, badge ? `${badge} chưa đọc` : undefined]
        .filter(Boolean)
        .join(', ')}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={cn(divider && 'border-b border-b-divider-1')}
      disabled={disabled}
      onPress={onPress}
    >
      {({ pressed }) => (
        // ✅ Nhấn = nền `bg-2` bo `xs` tràn 8dp mỗi bên (`-mx-xs px-xs`, vẫn nằm trong đệm 16 của `Card`) thay cho
        // `active:opacity-70`: dòng dài không co (`PressableScale` chỉ cho thẻ/ô độc lập), và làm mờ khó thấy dưới ngón tay.
        // ⛔ `collapsable={false}`: nền chỉ có LÚC NHẤN — Fabric/Android làm phẳng View không nền rồi vẽ vệt nhấn VUÔNG góc.
        // ⚠️ Tên + mô tả MỘT dòng mỗi thứ: mọi dòng của khung cao ĐỀU nhau (mô tả dài không đội riêng một dòng lên);
        // `accessibilityLabel` ở trên vẫn đọc đủ câu.
        <View
          className={cn(
            '-mx-xs min-h-14 flex-row items-center gap-sm rounded-xs px-xs py-sm',
            pressed && !disabled && 'bg-bg-2',
          )}
          collapsable={false}
        >
          <IconTile name={icon} tone={tileTone ?? TILE_TONE[tone]} />
          <View className="flex-1 gap-3xs">
            <Text
              className={cn('text-body-lg font-medium', danger ? 'text-error' : 'text-fg-1')}
              numberOfLines={1}
            >
              {label}
            </Text>
            {description ? (
              <Text className="text-caption-lg text-fg-2" numberOfLines={1}>
                {description}
              </Text>
            ) : null}
          </View>
          {badge ? <Badge count={badge} /> : null}
          {chevron ? <Icon color="fg-2" name="arrow-right-small" size="sm" /> : null}
        </View>
      )}
    </Pressable>
  );
}

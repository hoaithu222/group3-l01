import { Icon, type IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

export interface InfoActionRowProps {
  /** Dòng phụ dưới nhãn — giá trị HIỆN TẠI của thiết lập ("Mọi tin nhắn") hoặc hệ quả ngắn của hàng. */
  description?: string;
  icon: IconName;
  /** Tông ô icon của hàng thường — các hàng cạnh nhau nên xoay tông cho sinh động (xem `IconTile`). ⚠️ `tone="danger"` đè tông này. */
  iconTone?: IconTileTone;
  label: string;
  onPress: () => void;
  /** `danger` = thao tác phá huỷ/khó hoàn tác (Rời nhóm, Giải tán, Chặn, Xoá): nhãn + ô icon cùng đỏ. */
  tone?: 'default' | 'danger';
  /** Giá trị NGẮN ở cột phải (số thành viên) — đọc liền với nhãn thành một câu ("Thành viên: 3"). */
  value?: string;
}

/**
 * Hàng hành động của `ConversationInfoScreen` (DIRECT/GROUP): ô icon có tông · nhãn (chữ chính) · mô tả/giá trị · mũi tên — cùng khuôn
 * `MeNavRow` của màn Tôi (bản riêng của `conversations`, ⛔ không import chéo feature `me`). Dựng trên `ListItem` nên vai `button`,
 * vùng chạm ≥ 44dp và phản hồi nhấn (`active:opacity-70`) đã có sẵn.
 *
 * Ô icon 40dp (`IconTile md`) + `py-xs` ⇒ hàng cao ≥ 56dp. `divider` luôn bật: `InfoGroup` cắt vạch thừa của hàng CUỐI (hàng ẩn theo
 * quyền làm nơi gọi không biết hàng nào đứng cuối). Mũi tên `fg-2` (≥ 3:1) và không nhãn — ý "mở ra" đã nằm ở vai `button` của hàng.
 */
export function InfoActionRow({
  description,
  icon,
  iconTone = 'brand',
  label,
  onPress,
  tone = 'default',
  value,
}: InfoActionRowProps) {
  const danger = tone === 'danger';
  return (
    <ListItem
      className="py-xs"
      description={description}
      divider
      emphasis={danger ? 'danger' : 'title'}
      label={label}
      leading={<IconTile name={icon} tone={danger ? 'danger' : iconTone} />}
      trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
      value={value}
      onPress={onPress}
    />
  );
}

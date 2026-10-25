import { Pressable, Text, View } from 'react-native';

import { Badge, type BadgeVariant } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { cn } from '@/shared/utils/style/cn';

import { ITEM_TYPE_META } from '../../constants/study.constants';
import { ITEM_TYPE_TONE } from '../../utils/editor-type-meta';
import type { DraftItem } from '../../utils/editor-draft';
import type { RowBadge, RowBadgeKind } from '../../utils/editor-row';
import { summarize } from '../../utils/item-summary';

export interface ItemRowProps {
  badges: readonly RowBadge[];
  /** Dòng phụ: đáp án / số lựa chọn (`itemDetail`). */
  detail: string;
  index: number;
  item: DraftItem;
  last: boolean;
  media: { audio: boolean; image: boolean };
  selected: boolean;
  onMove: (key: string, direction: 'down' | 'up') => void;
  onSelect: (key: string) => void;
}

/** Tông huy hiệu theo loại — luôn kèm CHỮ nên màu chỉ để nhận nhanh, không phải dấu hiệu duy nhất. */
const BADGE_VARIANT: Record<RowBadgeKind, BadgeVariant> = {
  edited: 'info',
  'missing-answer': 'warning',
  'needs-fix': 'error',
  new: 'success',
};

/**
 * Một hàng của danh sách mục (app.md p4-01 §2 `ItemListPanel`): ô icon theo dạng, "3. câu hỏi" (cắt hai dòng), dòng phụ (đáp án /
 * số lựa chọn), tên dạng + icon ảnh/âm thanh + huy hiệu ("Cần sửa", "Thiếu đáp án", "Mới", "Đã sửa"), và Lên/Xuống.
 *
 * ⚠️ KHÔNG có nút Xoá trên hàng: xoá nằm ở form sửa mục — hai lối vào cho một thao tác phá huỷ, mà hàng lại cạnh sát nút Lên/Xuống,
 * là công thức của cú chạm nhầm. Lên/Xuống giữ bằng NÚT (không chỉ kéo thả) để người dùng TalkBack/tay run vẫn sắp xếp được.
 * Hàng đang mở (tablet: cột trái) có nền `surface-primary` + vạch trái đặc — không chỉ đổi màu.
 */
export function ItemRow({
  badges,
  detail,
  index,
  item,
  last,
  media,
  onMove,
  onSelect,
  selected,
}: ItemRowProps) {
  const meta = ITEM_TYPE_META[item.type];
  const title = summarize(item.prompt) || 'Chưa nhập nội dung';
  const problem = badges.some(
    (badge) => badge.kind === 'needs-fix' || badge.kind === 'missing-answer',
  );
  const notes = [
    badges.map((badge) => badge.label).join(', '),
    media.image ? 'có ảnh' : '',
    media.audio ? 'có âm thanh' : '',
  ].filter(Boolean);

  return (
    <View
      className={cn(
        'flex-row items-center gap-xs border-b border-b-divider-1 px-md py-xs',
        selected ? 'bg-surface-primary' : 'bg-bg-1',
      )}
    >
      {selected ? <View className="absolute inset-y-0 left-0 w-1 bg-action-base" /> : null}
      <Pressable
        accessibilityHint="Chạm để sửa mục"
        accessibilityLabel={`Mục ${index + 1}, ${meta.label}: ${title}${notes.length > 0 ? `. ${notes.join('. ')}` : ''}`}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        className="min-h-[44px] flex-1 flex-row items-center gap-sm active:opacity-70"
        onPress={() => onSelect(item.clientItemKey)}
      >
        <IconTile name={meta.icon} size="sm" tone={ITEM_TYPE_TONE[item.type]} />
        <View className="flex-1 gap-3xs">
          <Text className="text-label-md text-fg-1" numberOfLines={2}>
            {index + 1}. {title}
          </Text>
          <Text className="text-caption-sm text-fg-2" numberOfLines={1}>
            {detail}
          </Text>
          <View className="flex-row flex-wrap items-center gap-xs">
            <Text className="text-caption-sm text-fg-2">{meta.label}</Text>
            {media.image ? <Icon color="fg-2" name="image" size={14} /> : null}
            {media.audio ? <Icon color="fg-2" name="audio" size={14} /> : null}
            {problem ? <Icon color="error" name="alert-warning" size={14} /> : null}
            {badges.map((badge) => (
              <Badge
                key={badge.kind}
                label={badge.label}
                size="sm"
                variant={BADGE_VARIANT[badge.kind]}
              />
            ))}
          </View>
        </View>
      </Pressable>
      <Button
        accessibilityLabel={`Chuyển mục ${index + 1} lên`}
        disabled={index === 0}
        iconLeft="arrow-up-small"
        iconOnly
        size="sm"
        variant="tertiary"
        onPress={() => onMove(item.clientItemKey, 'up')}
      />
      <Button
        accessibilityLabel={`Chuyển mục ${index + 1} xuống`}
        disabled={last}
        iconLeft="arrow-down-small"
        iconOnly
        size="sm"
        variant="tertiary"
        onPress={() => onMove(item.clientItemKey, 'down')}
      />
    </View>
  );
}

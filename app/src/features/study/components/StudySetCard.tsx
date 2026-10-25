import { Pressable, Text, View } from 'react-native';
import { tv } from 'tailwind-variants';

import { Icon } from '@/shared/ui/icon';
import { twMergeConfig } from '@/shared/utils/style/cn';

import type { StudySetSummaryDto } from '../api/study.types';
import { VISIBILITY_META } from '../constants/study.constants';
import { SetCoverThumb } from './visual/SetCoverThumb';
import { SetInitialTile } from './visual/SetInitialTile';
import { StatPill } from './visual/StatPill';

/**
 * Màu icon phạm vi: riêng tư = xám (kín), công khai = xanh dương (mở ra ngoài), trong nhóm = xanh lá (nội bộ). ⚠️ Vẫn kèm
 * CHỮ ("Riêng tư"…) bên cạnh — màu chỉ để quét nhanh, không phải dấu hiệu duy nhất (`mobile-ux.md`).
 */
const VISIBILITY_INK = { PRIVATE: 'fg-2', PUBLIC: 'info', WORKSPACE: 'success' } as const;

/** Tối đa bấy nhiêu thẻ (#tag) trên một thẻ bộ — còn lại gộp thành "+N"; bộ có 10 thẻ không được biến hàng thành ba dòng chip. */
const MAX_TAGS = 3;

const card = tv(
  {
    slots: {
      // Lề ngang + khe dưới nằm ở `Pressable` (vùng chạm gồm cả khe), nền/bo góc ở `View` bên trong để `pressed` đổi được nền.
      pressable: 'px-md pb-sm',
      root: 'flex-row items-center gap-sm rounded-md p-sm',
    },
    variants: { pressed: { false: { root: 'bg-bg-1' }, true: { root: 'bg-bg-3' } } },
    defaultVariants: { pressed: false },
  },
  { twMergeConfig },
);

export interface StudySetCardProps {
  set: StudySetSummaryDto;
  /** Danh sách "Khám phá" hiện tên tác giả; "Của tôi" thì thừa. */
  showOwner?: boolean;
  onPress: (set: StudySetSummaryDto) => void;
}

/**
 * Một bộ học trong danh sách (app.md p4-01 §2 `StudySetCard`): ô bìa (ảnh, hoặc gradient tông suy từ tiêu đề + chữ cái đầu), tiêu đề, viên số mục +
 * PHẠM VI (icon + CHỮ, không chỉ màu), tác giả, vài thẻ #tag. Bộ bị ẩn (tác giả vẫn thấy) ghi "Đã bị ẩn" bằng chữ.
 *
 * ⚠️ Nhãn trợ năng GIỮ NGUYÊN khuôn `"<tiêu đề>, <n> mục, <phạm vi>[, đã bị ẩn]"` — trình đọc màn hình đọc một câu cho cả thẻ; các
 * viên bên trong là trang trí nên KHÔNG tự đọc riêng (cả thẻ là MỘT `Pressable accessible`).
 */
export function StudySetCard({ onPress, set, showOwner = false }: StudySetCardProps) {
  const meta = VISIBILITY_META[set.visibility];
  const hidden = set.status === 'HIDDEN';
  const owner = showOwner && set.owner ? set.owner.name : null;
  const tags = set.tags.slice(0, MAX_TAGS);
  const moreTags = set.tags.length - tags.length;

  return (
    <Pressable
      accessibilityLabel={`${set.title}, ${set.itemCount} mục, ${meta.label}${hidden ? ', đã bị ẩn' : ''}`}
      accessibilityRole="button"
      className={card().pressable()}
      onPress={() => onPress(set)}
    >
      {({ pressed }) => (
        <View className={card({ pressed }).root()}>
          {/* Có ảnh ⇒ `SetCoverThumb` (ảnh phủ lên mảng màu — ảnh hỏng thì mảng màu tự lộ ra); chưa có ảnh ⇒ ô gradient + chữ
              cái đầu (tĩnh, hợp hàng `FlashList`). */}
          {set.coverThumbUrl ? (
            <SetCoverThumb title={set.title} uri={set.coverThumbUrl} />
          ) : (
            <SetInitialTile title={set.title} />
          )}
          <View className="flex-1 gap-xs">
            <View className="gap-3xs">
              <Text className="text-label-lg font-semibold text-fg-1" numberOfLines={2}>
                {set.title}
              </Text>
              {owner ? (
                <Text className="text-caption-sm text-fg-2" numberOfLines={1}>
                  {`Bởi ${owner}`}
                </Text>
              ) : null}
            </View>
            <View className="flex-row flex-wrap gap-xs">
              <StatPill icon="copy" label={`${set.itemCount} mục`} />
              <StatPill
                icon={hidden ? 'hide' : meta.icon}
                iconColor={hidden ? 'warning' : VISIBILITY_INK[set.visibility]}
                label={hidden ? 'Đã bị ẩn' : meta.label}
              />
            </View>
            {tags.length > 0 ? (
              <View className="flex-row flex-wrap gap-xs">
                {tags.map((tag) => (
                  <StatPill key={tag} label={`#${tag}`} tone="brand" />
                ))}
                {moreTags > 0 ? <StatPill label={`+${moreTags}`} tone="brand" /> : null}
              </View>
            ) : null}
          </View>
          {/* Mũi tên báo "chạm để mở" — trang trí (icon không nhãn ⇒ ẩn khỏi trình đọc màn hình). */}
          <Icon color="fg-2" name="arrow-right-small" size="sm" />
        </View>
      )}
    </Pressable>
  );
}

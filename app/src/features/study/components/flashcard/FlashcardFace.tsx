import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { cn } from '@/shared/utils/style/cn';

import { STUDY_MODE_META } from '../../constants/study-modes.constants';
import { CARD_STATUS_LABEL, type CardStatus } from './study-progress';
import { TONE_BACK_FACE, type CardMode } from './study-tone.constants';

export interface FlashcardFaceProps {
  children: ReactNode;
  mode: CardMode;
  side: 'back' | 'front';
  /** Thẻ đã được chấm trong phiên này (xem lại bằng "Trước") — hiện huy hiệu để biết mình đã chọn gì. */
  status?: CardStatus | null;
}

/**
 * MỘT mặt của thẻ: khung + đầu thẻ GHIM Ở TRÊN (ô icon của chế độ + "Mặt trước/Mặt sau" + huy hiệu đã chọn) + vùng nội dung căn giữa
 * + dòng nhắc "Chạm để lật". Mặt trước nền `bg-1` trung tính; mặt sau nhuộm nhạt theo tông chế độ (`STUDY_MODE_META`) — nhìn là biết
 * đang xem đáp án, không cần đọc chữ.
 *
 * ── Vì sao chỉ NỘI DUNG nằm trong `ScrollView` ───────────────────────────────────────────────────────────────────────
 * Mặt thẻ dài (trắc nghiệm 6 lựa chọn kèm ảnh, lời giải 2000 ký tự) không được đẩy nút chấm ra khỏi màn hay bị cắt cụt ở máy nằm
 * ngang. `grow justify-center` giữ thẻ NGẮN căn giữa như cũ; đầu thẻ nằm NGOÀI vùng cuộn nên không trôi mất khi cuộn. Cử chỉ vuốt
 * ngang của bộ bài (`useDeckSwipe`) chỉ nhận khi vuốt ngang trước — cuộn dọc vẫn là của `ScrollView`.
 *
 * ⛔ Chữ IN HOA chỉ dùng `text-overline` (vai trò duy nhất được kiểm `lineHeight` cho dấu tiếng Việt); `fg-3` chỉ 2.96:1 nên chữ
 * phụ dùng `fg-2`.
 */
export function FlashcardFace({ children, mode, side, status }: FlashcardFaceProps) {
  const meta = STUDY_MODE_META[mode];
  return (
    <View
      className={cn(
        'flex-1 rounded-md border',
        side === 'back' ? TONE_BACK_FACE[meta.tone] : 'border-border-1 bg-bg-1',
      )}
    >
      <View className="flex-row items-center gap-xs px-lg pt-lg tablet:px-xl tablet:pt-xl">
        <IconTile name={meta.icon} size="sm" tone={meta.tone} />
        <Text className="flex-1 text-overline text-fg-2">
          {side === 'front' ? 'Mặt trước' : 'Mặt sau'}
        </Text>
        {status ? (
          <Badge
            label={CARD_STATUS_LABEL[status]}
            size="sm"
            variant={status === 'known' ? 'success' : 'warning'}
          />
        ) : null}
      </View>
      <ScrollView
        contentContainerClassName="grow justify-center gap-sm px-lg py-md tablet:px-xl"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      <View className="flex-row items-center justify-center gap-2xs pb-sm">
        <Icon color="fg-2" name="reload" size={14} />
        <Text className="text-caption-sm text-fg-2">Chạm để lật</Text>
      </View>
    </View>
  );
}

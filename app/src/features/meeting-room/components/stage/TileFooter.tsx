import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import { SpeakingBars } from './SpeakingBars';
import { TileScrim } from './TileScrim';

export interface TileFooterProps {
  /** Ô nhỏ (dải thumbnail, khung tự xem): chip chỉ còn hình, không chữ — nhãn trợ năng của ô vẫn đủ. */
  compact: boolean;
  micOff: boolean;
  name: string;
  /** "Chủ trì"/"Đồng chủ trì" — chỉ ô lớn; rỗng với thành viên thường. */
  role?: string;
  speaking: boolean;
}

/** Chip trạng thái: nền `action-*` + chữ/hình `action-*-fg` tương ứng (⛔ không `fg-inverse` — chế độ tối nền sáng, chữ tối). */
function SpeakingChip({ compact }: { compact: boolean }) {
  return (
    <View
      className={cn(
        'flex-row items-center gap-2xs rounded-full bg-action-success py-3xs',
        compact ? 'px-2xs' : 'px-xs',
      )}
    >
      <SpeakingBars />
      {compact ? null : (
        <Text
          className="text-caption-sm text-action-success-fg"
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
        >
          Đang nói
        </Text>
      )}
    </View>
  );
}

/**
 * ⚠️ Bộ icon KHÔNG có "mic gạch chéo" — chỉ `mic-01`. Nền ĐỎ + chữ "Đã tắt mic" mới là nghĩa (app.md §7: trạng thái phải có CHỮ); ô nhỏ
 * không đủ chỗ cho chữ thì còn chip đỏ, còn nghĩa đầy đủ nằm ở nhãn trợ năng của ô.
 */
function MicOffChip({ compact }: { compact: boolean }) {
  return (
    <View
      className={cn(
        'flex-row items-center gap-2xs rounded-full bg-action-error py-3xs',
        compact ? 'px-2xs' : 'px-xs',
      )}
    >
      <Icon color="action-error-fg" name="mic-01" size="xs" />
      {compact ? null : (
        <Text
          className="text-caption-sm text-action-error-fg"
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
        >
          Đã tắt mic
        </Text>
      )}
    </View>
  );
}

/**
 * Đáy ô kiểu Meet M3: tên (đậm, trái) + vai trò + chip trạng thái, nằm trên lớp scrim tối mờ dần (`TileScrim`) thay cho hàng viên xám.
 *
 * ⚠️ Scrim cao theo NỘI DUNG (lấp đầy khối này, cộng phần đệm trên `pt-*` để mờ dần): tên xuống dòng khi phóng chữ 1.3× vẫn nằm trọn
 * trên nền tối. Ô lớn cho phép xuống dòng (`flex-wrap`); ô nhỏ một dòng, tên co lại (`shrink` + `numberOfLines`).
 * ⛔ Không nhận chạm (`pointerEvents="none"`): nhấn giữ đi thẳng tới ô để ghim/bỏ ghim.
 */
export function TileFooter({ compact, micOff, name, role, speaking }: TileFooterProps) {
  return (
    <View
      className={cn(
        'absolute inset-x-0 bottom-0',
        compact ? 'px-2xs pb-2xs pt-md' : 'px-xs pb-xs pt-2xl',
      )}
      pointerEvents="none"
    >
      <TileScrim />
      <View className={cn('flex-row items-center gap-2xs', compact ? null : 'flex-wrap')}>
        <Text
          className={cn(
            'shrink text-fg-on-nav',
            compact ? 'text-caption-sm' : 'text-label-md font-semibold',
          )}
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
        >
          {name}
        </Text>
        {role && !compact ? (
          <Text
            className="text-caption-sm text-fg-on-nav-muted"
            maxFontSizeMultiplier={1.3}
            numberOfLines={1}
          >
            {role}
          </Text>
        ) : null}
        {speaking ? <SpeakingChip compact={compact} /> : null}
        {micOff ? <MicOffChip compact={compact} /> : null}
      </View>
    </View>
  );
}

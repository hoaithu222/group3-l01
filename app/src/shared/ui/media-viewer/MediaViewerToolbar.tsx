import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SPACING } from '@/shared/theme';
import { tCommon } from '@/shared/utils/i18n';

import { Icon } from '../icon';

export interface MediaViewerToolbarProps {
  /** Vị trí hiện tại (bắt đầu từ 0). */
  index: number;
  onClose: () => void;
  /** Có thì hiện nút "Chia sẻ". */
  onShare?: () => void;
  total: number;
}

/**
 * Thanh công cụ đè lên đầu `MediaViewer`: Đóng · "2/5" · Chia sẻ. Nút cao 44dp (`h-11 w-11`), có nhãn trợ năng.
 *
 * ⛔ Vùng an toàn đủ BỐN chiều: thanh trải hết bề ngang và toàn nút bấm — xoay ngang mà tai thỏ ăn vào mép thì nút "Đóng" nằm dưới tai
 * thỏ và không chạm được. Lề cộng với inset (style nội tuyến ĐÈ class nên không dùng `px-*` cho phần này).
 *
 * ⚠️ Nền của trình xem là `ink-10` (đen, GIỐNG NHAU ở hai chế độ) nên icon/chữ dùng `white-10` — KHÔNG `fg-inverse`: token đó đảo
 * chiều ở chế độ tối (thành mực đen) và nút "Đóng" biến mất trên nền đen.
 */
export function MediaViewerToolbar({ index, onClose, onShare, total }: MediaViewerToolbarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="absolute left-0 right-0 top-0 flex-row items-center justify-between"
      pointerEvents="box-none"
      style={{
        paddingLeft: insets.left + SPACING.xs,
        paddingRight: insets.right + SPACING.xs,
        paddingTop: insets.top + SPACING['2xs'],
      }}
    >
      <Pressable
        accessibilityLabel={tCommon('action.close')}
        accessibilityRole="button"
        className="h-11 w-11 items-center justify-center"
        onPress={onClose}
      >
        <Icon color="white-10" name="cancel" size={24} />
      </Pressable>

      {total > 1 ? (
        <Text
          accessibilityLabel={tCommon('media.position', { index: index + 1, total })}
          className="text-label-md text-white-10"
        >
          {tCommon('media.position', { index: index + 1, total })}
        </Text>
      ) : null}

      {onShare ? (
        <Pressable
          accessibilityLabel={tCommon('action.share')}
          accessibilityRole="button"
          className="h-11 w-11 items-center justify-center"
          onPress={onShare}
        >
          <Icon color="white-10" name="share" size={22} />
        </Pressable>
      ) : (
        // Giữ chỗ để bộ đếm nằm GIỮA (justify-between) kể cả khi không có nút chia sẻ.
        <View className="h-11 w-11" />
      )}
    </View>
  );
}

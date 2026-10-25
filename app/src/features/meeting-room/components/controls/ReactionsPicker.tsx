import { Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/shared/ui/motion';
import { hapticTap } from '@/shared/utils/haptics';
import { cn } from '@/shared/utils/style/cn';

import { REACTION_EMOJIS, type ReactionEmoji } from '../../constants/meeting-room.constants';
import { useControlBarSize } from './control-bar-size';

/** Tên gọi tiếng Việt làm nhãn trợ năng — trình đọc màn hình đọc được nghĩa, không chỉ tên biểu tượng cảm xúc của hệ điều hành. */
const EMOJI_NAME: Record<ReactionEmoji, string> = {
  '❤️': 'Yêu thích',
  '👍': 'Thích',
  '👏': 'Vỗ tay',
  '😂': 'Vui',
  '😮': 'Bất ngờ',
  '🎉': 'Chúc mừng',
};

/** Khe giữa thanh cảm xúc và thanh điều khiển (dp). */
const GAP_DP = 8;
/** Chưa đo được thanh điều khiển (lần mở đầu tiên trước `onLayout`, test) ⇒ cao ước lượng của thanh một hàng. */
const FALLBACK_BAR_DP = 88;

export interface ReactionsPickerProps {
  onClose: () => void;
  /** Gửi một cảm xúc — cha lo throttle 1 lần/giây (bấm dồn thì bỏ qua, không xếp hàng). */
  onPick: (emoji: ReactionEmoji) => void;
  visible: boolean;
}

/**
 * Chọn cảm xúc gửi cho cả phòng — THANH NỔI gọn (Meet/Teams): một hàng 6 emoji trong viên thuốc bo tròn, đậu ngay TRÊN thanh điều khiển
 * (nằm ngang: ngay TRÁI cột điều khiển). Chạm ra ngoài / phím Back để đóng; chọn xong tự đóng (cảm xúc bay lên sân khấu ngay).
 *
 * ✅ Thay tấm trượt đáy cũ: tấm che nửa màn đúng lúc người dùng muốn thấy cảm xúc của mình bay lên, và mất hai cú chạm cho một việc tức thời.
 * Ô 48dp (vùng chạm ≥ 44), co nhẹ khi nhấn (`PressableScale`, tự tắt khi "Giảm chuyển động") + rung nhẹ lúc gửi.
 * ⚠️ `Modal` trong suốt (KHÔNG làm tối sân khấu — video vẫn là thứ chính): nó bắt phím Back và cú chạm nền; vị trí thanh điều khiển lấy từ
 * `useControlBarSize` (đo thật, nhãn 2 dòng ở máy hẹp làm thanh cao hơn). Nền `ink-5` + viền `white-2` cố định: phòng họp luôn tối.
 * ⛔ Danh sách LẤY TỪ `REACTION_EMOJIS` — cùng danh sách cho phép mà bên nhận dùng để loại chuỗi lạ; tự thêm emoji ở đây là bên kia bỏ mất.
 */
export function ReactionsPicker({ onClose, onPick, visible }: ReactionsPickerProps) {
  const insets = useSafeAreaInsets();
  const bar = useControlBarSize();
  const window = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const landscape = window.width > window.height;
  const anchor = landscape
    ? { bottom: insets.bottom + GAP_DP, right: insets.right + bar.width + GAP_DP }
    : { bottom: insets.bottom + (bar.height || FALLBACK_BAR_DP) + GAP_DP };

  const send = (emoji: ReactionEmoji) => {
    // Rung TRƯỚC khi gửi: phản hồi của cú chạm, không phải của kết quả (`@/shared/utils/haptics`).
    hapticTap();
    onPick(emoji);
    onClose();
  };

  return (
    <Modal
      animationType={reduceMotion ? 'none' : 'fade'}
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View accessibilityViewIsModal className="flex-1">
        <Pressable accessibilityLabel="Đóng chọn cảm xúc" accessibilityRole="button" className="absolute inset-0" onPress={onClose} />
        <View className={landscape ? 'absolute' : 'absolute inset-x-0 items-center'} pointerEvents="box-none" style={anchor}>
          <View
            accessibilityLabel="Chọn cảm xúc để gửi"
            accessibilityRole="menu"
            className="flex-row gap-3xs rounded-full border-hairline border-white-2 bg-ink-5 p-2xs"
          >
            {REACTION_EMOJIS.map((emoji) => (
              <PressableScale
                key={emoji}
                accessibilityLabel={EMOJI_NAME[emoji]}
                accessibilityRole="button"
                className="h-12 w-12"
                contentClassName={({ pressed }) =>
                  cn('h-12 w-12 items-center justify-center rounded-full', pressed ? 'bg-white-2' : 'bg-transparent')
                }
                scaleTo={0.88}
                onPress={() => send(emoji)}
              >
                {/* Emoji là HÌNH của ô — ô là MỘT phần tử trợ năng mang `accessibilityLabel` tiếng Việt, đè lên tên emoji của hệ điều hành. */}
                <Text className="text-header-md" maxFontSizeMultiplier={1.3}>
                  {emoji}
                </Text>
              </PressableScale>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

import { forwardRef, useState } from 'react';
import {
  TextInput,
  View,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
  type TextInputScrollEventData,
  type TextInputSelectionChangeEventData,
} from 'react-native';

import { useCaretColors, useThemeColor } from '@/shared/theme';
import { cn } from '@/shared/utils/style/cn';

import type { MentionRange } from '../../api/chat.types';
import { CHAT_LIMITS, MENTION_HIGHLIGHT_ENABLED } from '../../chat.constants';
import { MentionHighlight } from '../../mentions/MentionHighlight';
import { graphemeLength } from '../../utils/grapheme';
import { CharCount } from './CharCount';

/** Cao một dòng chữ `text-body-lg` (16/24) — số ĐO của thang chữ, đổi vai trò chữ thì đổi cả hằng này. */
const LINE_HEIGHT = 24;
/**
 * Đệm dọc của `TextInput`: viên thuốc cao tối thiểu 40 (= `h-control-sm`, cùng cao nút Đính kèm/Gửi/Mic) = viền 1 + 7 + 24 + 7 + viền 1.
 * ⚠️ Vì sao 7 mà không phải 8: viền 1dp của viên thuốc cũng nằm TRONG chiều cao — đệm 8 cho 42 và ô nhập cao hơn nút 2dp, lệch trục ở
 * hàng 1 dòng (đã đo lỗi này ở hàng cũ: mỗi phần tử lệch nhau vài dp). `MentionHighlight` PHẢI dùng cùng số này.
 */
const PAD_Y = 7;
const MIN_HEIGHT = LINE_HEIGHT + PAD_Y * 2;
/** Tối đa 6 dòng (app.md §3 "AutoGrowTextInput 1–6 dòng") rồi cuộn bên trong. */
const MAX_ROWS = 6;

export interface ComposerInputProps {
  value: string;
  onChangeText: (text: string) => void;
  /** Cụm nhắc tên trong `value` — có thì tô nền đằng sau (`MentionHighlight`). */
  ranges?: MentionRange[];
  /**
   * Độ dài tính theo NỘI DUNG GỬI ĐI (marker `@{u:<24 hex>}` dài hơn `@Tên` rất nhiều,
   * mà BE đếm giới hạn 4.000 trên chuỗi có marker) — không truyền thì đếm `value`.
   */
  length?: number;
  /** Chỉ ÉP một nhịp sau khi chọn gợi ý nhắc tên (xem `useComposerText`); còn lại để `undefined`. */
  selection?: { start: number; end: number };
  onSelectionChange?: (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Ô được chạm/focus — `ComposerBody` dùng để ĐÓNG bảng emoji (chạm lại ô nhập thì bàn phím trở lại, kiểu Zalo). */
  onFocus?: () => void;
}

/**
 * Ô nhập DẠNG VIÊN THUỐC tự giãn 1–6 dòng — CONTROLLED (khác quy ước `SearchInput` uncontrolled
 * của `shared/ui`): tin nhắn cần đọc lại giá trị để đếm ký tự/xoá sau khi gửi,
 * và vòng `onChangeText → setState → value` chạy ĐỒNG BỘ theo từng phím nên
 * không rơi vào bẫy ghi đè giữa lúc gõ dấu Telex (bẫy đó chỉ xảy ra khi giá trị
 * được set LẠI SAU MỘT ĐỘ TRỄ — vd debounce tìm kiếm — không phải trường hợp
 * ở đây). Ca DUY NHẤT `value` khác chữ native vừa báo (Backspace xoá nguyên chip) đã được
 * `useComposerText` ép lại con trỏ.
 *
 * ── Hình học (bám `ComposerInputRow` của vci-sun-mobile, số đo theo token Super App) ──
 *  · Viên thuốc: `rounded-md` (24dp) > nửa cao tối thiểu (20dp) ⇒ RN KẸP về 20 ở 1 dòng (bo tròn hoàn hảo) và GIỮ 24 khi nở nhiều
 *    dòng. ⛔ Không `rounded-full`: bán kính 9999 kẹp theo nửa cạnh ngắn NGAY LÚC ĐÓ — ô cao 160 sẽ bo 80, hai đầu thành hai nửa vòng tròn khổng lồ.
 *  · Viền 1dp ở CẢ hai trạng thái (`border-border-1` → `border-border-brand` lúc focus): chỉ đổi MÀU, ⛔ không đổi bề dày —
 *    `border-medium` lúc focus ăn thêm 0,5dp mỗi cạnh và chữ nhích đúng lúc người dùng vừa đặt con trỏ vào. Nền cũng nhích một bậc
 *    (`bg-bg-3` → `bg-bg-input`) để ô đang gõ nổi lên, và để dải nền chip nhắc tên (`action-tint`) tách được khỏi nền ô.
 *  · Đệm ngang 16 nằm ở viên thuốc, TextInput để `paddingHorizontal: 0`: lớp tô nền của chip (`MentionHighlight`) dùng cùng
 *    số đo này, mà Android có thể chừa lề ngang mặc định cho `TextInput` — lệch lề là lệch dải nền.
 *
 * ── Vì sao KHÔNG còn `height` điều khiển bằng `onContentSizeChange` (lỗi "chiều cao giật khi gõ") ──
 * Bản cũ giữ `height` trong state và cập nhật SAU KHI native báo kích thước nội dung ⇒ chữ dài thêm một dòng thì `EditText` còn cao
 * cũ (40) suốt 1–2 khung hình: nó tự cuộn để giữ con trỏ trong tầm nhìn (dòng đầu trôi lên) rồi mới nở ra — thấy rõ như một cú giật
 * khi gõ từ dòng 1 sang dòng 2 và khi xoá về dòng 1. `TextInput multiline` của Fabric TỰ đo nội dung ngay trong lượt layout nên
 * chỉ cần `minHeight`/`maxHeight`; `onContentSizeChange` chỉ còn dùng để biết đã chạm trần hay chưa (bật cuộn/dời lớp tô nền).
 * `contentSize` gồm cả đệm dọc (đã đọc `ReactTextContentSizeWatcher.kt`: `compoundPaddingTop + layout.height + compoundPaddingBottom`).
 * Cao tối đa nhân theo cỡ chữ hệ thống (`fontScale`) để "6 dòng" vẫn là 6 dòng khi người dùng phóng chữ.
 */
export const ComposerInput = forwardRef<TextInput, ComposerInputProps>(function ComposerInput(
  {
    value,
    onChangeText,
    ranges,
    length: lengthProp,
    selection,
    onSelectionChange,
    onFocus,
    disabled = false,
    placeholder = 'Nhắn tin…',
  },
  ref,
) {
  const { fontScale } = useWindowDimensions();
  const maxHeight = LINE_HEIGHT * Math.max(1, fontScale) * MAX_ROWS + PAD_Y * 2;
  const [focused, setFocused] = useState(false);
  /** Chữ đã dài hơn trần cao ⇒ ô cuộn bên trong. */
  const [overflowing, setOverflowing] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const length = lengthProp ?? graphemeLength(value);
  const overLimit = length > CHAT_LIMITS.maxChars;
  // `placeholderTextColor` là prop NATIVE thô, không nhận className (cùng bẫy
  // đã ghi ở `InputControls.tsx`) — phải lấy màu đã phân giải qua `useThemeColor`.
  const placeholderColor = useThemeColor('fg-2');
  // Con trỏ/vùng bôi theo màu thương hiệu, không phải teal mặc định của Android — xem `useCaretColors`.
  const caret = useCaretColors();

  const handleContentSizeChange = (event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
    const next = event.nativeEvent.contentSize.height > maxHeight;
    setOverflowing(next);
    // Co lại dưới trần thì native cuộn về đầu mà không báo `onScroll` — tự đặt lại để lớp tô nền không kẹt ở vị trí cũ.
    if (!next) setScrollY(0);
  };

  const handleScroll = (event: NativeSyntheticEvent<TextInputScrollEventData>) =>
    setScrollY(event.nativeEvent.contentOffset.y);

  return (
    <View
      className={cn(
        'mx-xs min-h-10 flex-1 justify-center rounded-md border-hairline px-md',
        focused ? 'border-border-brand bg-bg-input' : 'border-border-1 bg-bg-3',
      )}
    >
      {/* Lớp bọc KHÔNG đệm: `MentionHighlight` (absolute) và `TextInput` nằm cùng một hệ toạ độ ⇒ dải nền chip khớp đúng dòng chữ.
          `overflow-hidden` để phần lớp tô nền trôi ra ngoài khi ô cuộn bị cắt (xem `offsetY`). */}
      <View className="overflow-hidden">
        {MENTION_HIGHLIGHT_ENABLED && ranges ? (
          <MentionHighlight offsetY={overflowing ? scrollY : 0} paddingVertical={PAD_Y} ranges={ranges} text={value} />
        ) : null}
        <TextInput
          ref={ref}
          accessibilityLabel="Nội dung tin nhắn"
          {...caret}
          className={overLimit ? 'text-body-lg text-error' : 'text-body-lg text-fg-1'}
          editable={!disabled}
          multiline
          placeholder={placeholder}
          placeholderTextColor={placeholderColor}
          // `scrollEnabled` chỉ có nghĩa trên iOS: dưới trần mà cho cuộn thì UITextView "rung" theo ngón tay.
          scrollEnabled={overflowing}
          selection={selection}
          style={{ maxHeight, minHeight: MIN_HEIGHT, paddingHorizontal: 0, paddingVertical: PAD_Y }}
          value={value}
          onBlur={() => setFocused(false)}
          onChangeText={onChangeText}
          onContentSizeChange={handleContentSizeChange}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onScroll={handleScroll}
          onSelectionChange={onSelectionChange}
        />
      </View>
      {length > CHAT_LIMITS.maxChars - 200 ? (
        <View className="items-end pb-2xs">
          <CharCount length={length} />
        </View>
      ) : null}
    </View>
  );
});

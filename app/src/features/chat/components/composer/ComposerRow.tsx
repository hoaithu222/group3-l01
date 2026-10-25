import type { Ref } from 'react';
import { Text, View, type TextInput } from 'react-native';

import type { VoiceRecordResult } from '@/core/media/use-voice-recorder';
import { VoiceRecorderButton } from '@/shared/ui/attachment';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { hapticTap } from '@/shared/utils/haptics';

import { ComposerInput, type ComposerInputProps } from './ComposerInput';
import { ComposerToolButton } from './ComposerToolButton';

export interface ComposerRowProps {
  /** Có chữ hoặc tệp đã sẵn sàng ⇒ hiện nút Gửi; không thì hiện nút Mic. */
  hasContent: boolean;
  /** `hasContent` nhưng chưa gửi được (quá 4.000 ký tự, tệp còn tải, đang chờ hạn mức…) ⇒ nút Gửi mờ. */
  canSend: boolean;
  /**
   * Nút emoji cạnh "+" (mở/đóng bảng emoji). Không truyền ⇒ không có nút — hàng vẫn dựng được cho nơi chỉ cần Đính kèm · ô nhập · Gửi.
   * `open` = bảng đang mở: nút đổi thành biểu tượng bàn phím để quay lại gõ chữ.
   */
  emoji?: { open: boolean; onToggle: () => void };
  input: ComposerInputProps;
  /** Ref của `TextInput` — `useEmojiPanel` cần `blur()`/`focus()` khi mở/đóng bảng emoji. */
  inputRef?: Ref<TextInput>;
  onAttach: () => void;
  onRecorded: (result: VoiceRecordResult) => void;
  onSend: () => void;
}

/**
 * Hàng ô soạn tin: `[+ Đính kèm] [emoji] [ô nhập viên thuốc] [Gửi | Mic]` — bám bố cục `ComposerInputRow` của vci-sun-mobile.
 *
 * ⚠️ Cả ba phần tử cùng cao 40dp (`h-control-sm` = cao tối thiểu của viên thuốc trong `ComposerInput`) nên ở 1 dòng chúng
 * TRÙNG một trục ngang; ô nhập cao lên (≤ 6 dòng) thì nút neo ĐÁY (`items-end`). Đừng đổi một nút sang cỡ
 * khác: nút Mic từng là 56dp làm cả hàng cao lên 16dp và lệch trục so với "+" / chữ nhập (đo trên máy thật:
 * tâm "+" · Mic · chữ lệch nhau mỗi cái 8dp).
 *
 * ⛔ `pressableClassName="self-end"` là BẮT BUỘC cho mọi `Button` trong hàng này: lớp `Pressable` của `Button`
 * mang sẵn `self-start` (`button.styles.ts`) và tự ghi đè `items-end` của hàng ⇒ nút dính ĐỈNH hàng trong khi
 * ô nhập dính đáy. `className` KHÔNG tới được lớp đó — chỉ `pressableClassName` (xem `Button.tsx`).
 *
 * Lề ngoài `px-xs` (8dp) vì các nút hai đầu tự mang đệm trong: hình `+` cách mép màn 8 + 8 = 16dp, đĩa Gửi/Mic cách mép 8dp và
 * glyph trong đĩa (24 trong 40) cách mép 16dp — cùng lề 16 của mọi hàng khác. Nút Gửi LUÔN có đĩa nền: mờ (`action-disabled`) khi
 * chưa gửi được, `action-base` khi gửi được — ⛔ không để mũi tên trần lửng lơ sát mép phải.
 *
 * `py-xs` (8dp) chừa khoảng thở phía trên thanh tab. ⛔ KHÔNG cộng `insets.bottom` ở đây: vùng an toàn đáy đã
 * do thanh tab dưới (`BottomNav`) hoặc `BottomSheet` chứa ô soạn tin lo — cộng nữa là thừa một dải trống.
 */
export function ComposerRow({ hasContent, canSend, emoji, input, inputRef, onAttach, onRecorded, onSend }: ComposerRowProps) {
  return (
    <View className="flex-row items-end px-xs py-xs">
      <ComposerToolButton accessibilityLabel="Đính kèm" first onPress={onAttach}>
        <Icon color="fg-2" name="add-circle" />
      </ComposerToolButton>
      {emoji ? (
        <ComposerToolButton
          accessibilityLabel={emoji.open ? 'Bàn phím' : 'Biểu tượng cảm xúc'}
          selected={emoji.open}
          onPress={emoji.onToggle}
        >
          {emoji.open ? (
            <Icon color="fg-brand" name="keyboard" />
          ) : (
            // Bộ icon chưa có mặt cười ⇒ dùng ký tự emoji (chữ, không phải icon-lib). ⚠️ `text-header-sm` 18/24: lineHeight 24 = ô 24dp nên không cắt.
            <Text className="text-header-sm" maxFontSizeMultiplier={1.3}>
              🙂
            </Text>
          )}
        </ComposerToolButton>
      ) : null}
      <ComposerInput {...input} ref={inputRef} />
      {hasContent ? (
        <Button
          accessibilityLabel="Gửi"
          disabled={!canSend}
          iconLeft="arrow-up"
          iconOnly
          pressableClassName="self-end"
          size="sm"
          // Rung nhẹ xác nhận cú chạm GỬI (tin hiện ngay dạng "đang gửi", rung cho biết cú chạm đã nhận) — nút khoá thì không tới đây.
          onPress={() => {
            hapticTap();
            onSend();
          }}
        />
      ) : (
        <VoiceRecorderButton size="sm" onRecorded={onRecorded} />
      )}
    </View>
  );
}

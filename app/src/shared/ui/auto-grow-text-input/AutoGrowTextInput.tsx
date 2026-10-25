import { forwardRef, useState } from 'react';
import {
  TextInput,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
  type TextInputProps,
} from 'react-native';

import { useCaretColors, useThemeColor } from '@/shared/theme';
import { cn } from '@/shared/utils/style/cn';

/**
 * Cao một dòng chữ `text-body-lg` (16/24). ⚠️ Số này là ĐO của thang chữ (`typography.json`), không phải tuỳ ý: chỉnh
 * vai trò chữ của ô thì chỉnh cả hằng này (hoặc truyền `lineHeight`).
 */
export const AUTO_GROW_LINE_HEIGHT = 24;

export interface AutoGrowTextInputProps
  extends Omit<
    TextInputProps,
    'multiline' | 'numberOfLines' | 'onChangeText' | 'scrollEnabled' | 'style' | 'submitBehavior' | 'value'
  > {
  /**
   * ⛔ BẮT BUỘC (tsc chặn): ô nhập chỉ có `placeholder` thì trình đọc màn hình không biết đây là ô gì — placeholder biến mất
   * khi gõ và iOS đọc nó như GIÁ TRỊ của ô.
   */
  accessibilityLabel: string;
  /** Lớp cho CHỮ của ô (màu, cỡ). Khung/viền/nền/đệm là việc của nơi gọi — bọc ô trong một `View` riêng. */
  className?: string;
  /** Cao một dòng (dp, chưa nhân cỡ chữ hệ thống). Mặc định khớp `text-body-lg`. */
  lineHeight?: number;
  /** Số dòng TỐI ĐA trước khi ô thôi cao thêm và cuộn bên trong. Mặc định 6. */
  maxRows?: number;
  /** Số dòng TỐI THIỂU (chiều cao khi rỗng). Mặc định 1. */
  minRows?: number;
  onChangeText: (text: string) => void;
  /** Chiều cao mới (dp) mỗi khi ô co giãn — để màn cha dời nút Gửi, giữ danh sách bám đáy… */
  onHeightChange?: (height: number) => void;
  value: string;
}

/**
 * Ô nhập nhiều dòng TỰ CAO từ `minRows` tới `maxRows` rồi cuộn bên trong — cho soạn tin nhắn, bình luận, ghi chú (p0-12).
 *
 * ```tsx
 * <AutoGrowTextInput accessibilityLabel="Nội dung tin nhắn" placeholder="Nhắn tin…" value={text} onChangeText={setText} />
 * ```
 *
 * ── Controlled, và cái bẫy IME ──────────────────────────────────────────────────────────────────────────────────────────
 * `value` là CONTROLLED (khác `SearchInput` uncontrolled): tin nhắn cần đọc lại giá trị để đếm ký tự/xoá sau khi gửi. Vòng
 * `onChangeText → setState → value` chạy ĐỒNG BỘ theo từng phím nên không rơi vào bẫy ghi đè giữa lúc gõ dấu Telex. ⛔ Bẫy
 * chỉ xảy ra khi `value` được set LẠI SAU MỘT ĐỘ TRỄ (debounce, `startTransition`, giá trị từ server) — đừng làm vậy với ô này;
 * đổi `value` từ NGOÀI (xoá sau khi gửi, chèn @nhắc tên) thì được, nội dung mới hiện đúng, không mất ký tự.
 *
 * ── Chiều cao ────────────────────────────────────────────────────────────────────────────────────────────────────────────
 * Đệm dọc/ngang của chính `TextInput` đặt về 0 để `contentSize.height` (native báo) = đúng chiều cao chữ, không lẫn đệm — cả
 * Android lẫn iOS. Nơi gọi tự cho khung bọc đệm. Cao tối thiểu/tối đa nhân theo cỡ chữ hệ thống (`fontScale`): người
 * dùng phóng chữ 2× thì một dòng cao 48dp, không bị cắt. ⛔ Không đặt `allowFontScaling={false}`.
 *
 * Enter LUÔN xuống dòng (`submitBehavior="newline"`) — gửi tin là nút Gửi, không phải phím Enter của bàn phím ảo.
 */
export const AutoGrowTextInput = forwardRef<TextInput, AutoGrowTextInputProps>(
  function AutoGrowTextInput(
    {
      className,
      lineHeight = AUTO_GROW_LINE_HEIGHT,
      maxRows = 6,
      minRows = 1,
      onContentSizeChange,
      onHeightChange,
      ...rest
    },
    ref,
  ) {
    const { fontScale } = useWindowDimensions();
    const [contentHeight, setContentHeight] = useState(0);
    // `placeholderTextColor` là prop native THÔ, không nhận className — phải lấy màu đã phân giải qua theme.
    const placeholderColor = useThemeColor('fg-2');
    // Con trỏ/vùng bôi theo màu thương hiệu, không phải teal mặc định của Android — xem `useCaretColors`.
    const caret = useCaretColors();

    const rowHeight = lineHeight * Math.max(1, fontScale);
    const minHeight = Math.max(1, Math.floor(minRows)) * rowHeight;
    const maxHeight = Math.max(minHeight, Math.floor(maxRows) * rowHeight);
    const height = Math.min(maxHeight, Math.max(minHeight, contentHeight));

    const handleContentSizeChange = (
      event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>,
    ) => {
      const next = Math.ceil(event.nativeEvent.contentSize.height);
      if (next !== contentHeight) {
        setContentHeight(next);
        onHeightChange?.(Math.min(maxHeight, Math.max(minHeight, next)));
      }
      onContentSizeChange?.(event);
    };

    return (
      <TextInput
        ref={ref}
        className={cn('text-body-lg text-fg-1', className)}
        {...caret}
        multiline
        placeholderTextColor={placeholderColor}
        // Cuộn trong ô CHỈ khi chữ đã vượt trần — dưới trần mà cho cuộn thì ô "rung" theo ngón tay khi vuốt.
        scrollEnabled={contentHeight > maxHeight}
        style={{ height, paddingHorizontal: 0, paddingVertical: 0, textAlignVertical: 'top' }}
        submitBehavior="newline"
        onContentSizeChange={handleContentSizeChange}
        {...rest}
      />
    );
  },
);

import { useState } from 'react';
import {
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
} from 'react-native';

import { useThemeColor } from '@/shared/theme';

import type { useMentionInput } from '../../hooks/useMentionInput';
import { MentionSuggestions } from './MentionSuggestions';

const MIN_HEIGHT = 40;
/** 6 dòng ở `text-body-lg` (16/24) + đệm dọc — cùng trần với ô soạn tin của chat. */
const MAX_HEIGHT = 24 * 6 + 16;

export interface MentionTextInputProps {
  autoFocus?: boolean;
  disabled?: boolean;
  /** Kết quả `useMentionInput` — nơi gọi giữ text/picks, component chỉ vẽ. */
  input: ReturnType<typeof useMentionInput>;
  placeholder?: string;
  text: string;
}

/**
 * Ô nhập nhiều dòng có gợi ý nhắc tên, tự giãn 1–6 dòng — dùng chung cho soạn bình luận và sửa bình luận.
 *
 * Viết bằng `TextInput` trần thay vì `Input` của bộ chung: `Input` là ô FORM (nhãn, viền, thông điệp lỗi,
 * chiều cao control) còn đây là ô soạn dạng chat, không khung — cùng lựa chọn của `ComposerInput` (chat).
 * CONTROLLED vì `onChangeText → setState → value` chạy đồng bộ theo từng phím (không có nhịp trễ ghi đè
 * giữa lúc bộ gõ tiếng Việt ghép dấu). `placeholderTextColor` là prop native, không nhận className.
 */
export function MentionTextInput({
  autoFocus,
  disabled = false,
  input,
  placeholder,
  text,
}: MentionTextInputProps) {
  const [height, setHeight] = useState(MIN_HEIGHT);
  const placeholderColor = useThemeColor('fg-2');

  const grow = (event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) =>
    setHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, event.nativeEvent.contentSize.height)));

  return (
    <View>
      {input.triggerOpen ? (
        <MentionSuggestions
          loading={input.loading}
          people={input.suggestions}
          onPick={input.pick}
        />
      ) : null}
      <TextInput
        accessibilityLabel="Nội dung bình luận"
        autoFocus={autoFocus}
        className="rounded-xs bg-bg-2 px-sm text-body-lg text-fg-1"
        editable={!disabled}
        multiline
        placeholder={placeholder}
        placeholderTextColor={placeholderColor}
        selection={input.forcedSelection}
        style={{ height, maxHeight: MAX_HEIGHT, minHeight: MIN_HEIGHT, paddingVertical: 8 }}
        textAlignVertical="top"
        value={text}
        onChangeText={input.changeText}
        onContentSizeChange={grow}
        onSelectionChange={input.onSelectionChange}
      />
    </View>
  );
}

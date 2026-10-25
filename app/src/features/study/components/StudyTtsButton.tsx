import { Button, type ButtonSize } from '@/shared/ui/button';

import { useTextToSpeech } from '../hooks/useTextToSpeech';

export interface StudyTtsButtonProps {
  /** Nội dung đọc lên — mặt trước thẻ (từ/câu tiếng Anh). */
  text: string;
  /** Mã ngôn ngữ giọng đọc — mặc định tiếng Anh Mỹ. */
  language?: string;
  label?: string;
  size?: ButtonSize;
}

/**
 * Nút loa đọc bằng giọng máy (`expo-speech`) cho mục học CHƯA có file âm thanh thật — dùng cùng dáng với
 * `StudyAudioButton` (đổi sang `primary` + icon tạm dừng khi đang đọc) để người học không phân biệt hai nguồn âm thanh.
 */
export function StudyTtsButton({ text, language = 'en-US', label = 'Nghe phát âm', size = 'sm' }: StudyTtsButtonProps) {
  const tts = useTextToSpeech(text, language);

  return (
    <Button
      accessibilityLabel={tts.speaking ? `Dừng đọc: ${label}` : label}
      iconLeft={tts.speaking ? 'pause' : 'audio'}
      label={tts.speaking ? 'Dừng' : label}
      size={size}
      variant={tts.speaking ? 'primary' : 'secondary'}
      onPress={tts.toggle}
    />
  );
}

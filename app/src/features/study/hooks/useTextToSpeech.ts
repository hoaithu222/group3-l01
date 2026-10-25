import * as Speech from 'expo-speech';
import { useCallback, useState } from 'react';

export interface TextToSpeech {
  speaking: boolean;
  toggle: () => void;
}

/**
 * Đọc to một đoạn text bằng giọng tổng hợp của máy (`expo-speech`, không cần asset/mạng) — dùng cho mục học tiếng Anh
 * chưa có file âm thanh thật. `Speech.speak` không có state sẵn nên tự theo dõi qua callback `onDone`/`onStopped`/`onError`.
 */
export function useTextToSpeech(text: string, language = 'en-US'): TextToSpeech {
  const [speaking, setSpeaking] = useState(false);

  const toggle = useCallback(() => {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(text, {
      language,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }, [language, speaking, text]);

  return { speaking, toggle };
}

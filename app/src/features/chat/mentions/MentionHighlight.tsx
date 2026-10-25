import { Text, View } from 'react-native';

import type { MentionRange } from '../api/chat.types';
import { segmentByRanges } from './mention-range-helpers';

export interface MentionHighlightProps {
  text: string;
  ranges: MentionRange[];
  /** Đệm dọc của `TextInput` đứng trên — PHẢI bằng đúng số đó, lệch là dải nền lệch dòng. Mặc định 8 (như bản cũ). */
  paddingVertical?: number;
  /**
   * Số dp ô nhập đã cuộn (nội dung dài quá trần cao). `TextInput` cuộn bên trong còn lớp này thì KHÔNG — thiếu số này, quá 6 dòng
   * là dải nền đứng yên ở đầu trong khi chữ trôi đi (nền chip nằm nhầm dòng). Chỗ đặt lớp phải `overflow-hidden` để phần trôi ra ngoài bị cắt.
   */
  offsetY?: number;
}

/**
 * Lớp TÔ NỀN cho chip nhắc tên, đặt SAU `TextInput` (README p1-06 §10 / app.md §6:
 * "lớp `Text` overlay tô chip phía sau `TextInput`"). Chữ của lớp này TRONG SUỐT —
 * chữ người dùng thấy và gõ vẫn là của chính `TextInput`, lớp này chỉ để lộ ra dải nền
 * đằng sau các đoạn `@Tên`. Nhờ vậy `TextInput` giữ nguyên là ô controlled thuần, không
 * `children` lồng, không đụng gì tới bộ gõ Telex/VNI.
 *
 * ⚠️ CHƯA kiểm trên máy thật: dải nền chỉ khớp chữ nếu font/cỡ/`paddingVertical`/bề rộng
 * của hai lớp trùng nhau (xem `ComposerInput.tsx`). Lệch thì chỉ tô lệch vài dp — chữ và
 * marker gửi đi không bị ảnh hưởng. Muốn tắt hẳn: `MENTION_HIGHLIGHT_ENABLED` (chat.constants).
 * Ẩn khỏi trình đọc màn hình (chữ đã có ở ô nhập thật) và không nhận cú chạm.
 */
export function MentionHighlight({ text, ranges, paddingVertical = 8, offsetY = 0 }: MentionHighlightProps) {
  const segments = segmentByRanges(text, ranges);
  if (!segments.some((s) => s.range)) return null;

  return (
    <View
      accessibilityElementsHidden
      className="absolute inset-x-0"
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ top: -offsetY }}
    >
      <Text
        className="text-body-lg text-transparent"
        style={{ paddingHorizontal: 0, paddingVertical }}
      >
        {segments.map((segment, index) =>
          segment.range ? (
            <Text
              key={index}
              className={segment.range.invalid ? 'bg-surface-error' : 'bg-action-tint'}
            >
              {segment.text}
            </Text>
          ) : (
            segment.text
          ),
        )}
      </Text>
    </View>
  );
}

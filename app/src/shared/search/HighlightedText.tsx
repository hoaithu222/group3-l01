import { useMemo } from 'react';
import { Text } from 'react-native';

import { splitByHighlights, type TextHighlight } from './highlight';

export interface HighlightedTextProps {
  className?: string;
  /** Lớp của ĐOẠN KHỚP — mặc định đậm + đổi màu + nền nhạt (kiểu p1-09); nơi gọi đổi được kiểu nhấn nhưng ⛔ không bỏ hết chữ đậm. */
  highlightClassName?: string;
  highlights: readonly TextHighlight[];
  numberOfLines?: number;
  text: string;
}

/** Nhấn mặc định: đổi MÀU + ĐẬM + nền nhạt — không để màu là dấu hiệu duy nhất (người mù màu, chế độ tối). */
export const DEFAULT_HIGHLIGHT_CLASS = 'bg-action-tint font-semibold text-fg-brand';

/**
 * `snippet` với các đoạn khớp NỔI BẬT — `Text` lồng nhau. Nhãn trợ năng đọc CẢ snippet nên do NƠI GỌI gắn ở hàng
 * (`SearchHitRow`, `MessageResultItem`), không đọc từng đoạn rời.
 *
 * ⚠️ Mọi đoạn (kể cả đoạn thường) là một `<Text>` có `key` riêng thay vì trộn chuỗi trần với phần tử — mảng con hỗn hợp
 * sinh cảnh báo `key` khi danh sách đoạn đổi (gõ tiếp từ khoá), và chuỗi trần không có chỗ để React đối chiếu.
 */
export function HighlightedText({
  className,
  highlightClassName = DEFAULT_HIGHLIGHT_CLASS,
  highlights,
  numberOfLines,
  text,
}: HighlightedTextProps) {
  const segments = useMemo(() => splitByHighlights(text, highlights), [text, highlights]);

  return (
    <Text className={className} numberOfLines={numberOfLines}>
      {segments.map((segment, index) => (
        <Text
          key={`${index}-${segment.highlighted ? 'h' : 'n'}`}
          className={segment.highlighted ? highlightClassName : undefined}
        >
          {segment.text}
        </Text>
      ))}
    </Text>
  );
}

import { HighlightedText, type TextHighlight } from '@/shared/search';

export interface HighlightedSnippetProps {
  className?: string;
  /** Đoạn khớp theo UTF-16 code unit trong `snippet` — có thể CHỒNG/liền nhau (gộp trước khi vẽ). */
  highlights: readonly TextHighlight[];
  numberOfLines?: number;
  snippet: string;
}

/**
 * Nhấn: chữ ĐẬM + GẠCH CHÂN nhẹ + màu + nền nhạt — không để màu là dấu hiệu duy nhất (app.md p5-04 §7; người mù màu, chế độ
 * tối). Khác nhấn mặc định của p1-09 ở chỗ có thêm gạch chân.
 */
const HIGHLIGHT_CLASS = 'bg-action-tint font-bold text-fg-brand underline';

/**
 * `snippet` của kết quả tin với các đoạn khớp NỔI BẬT. Tách/gộp đoạn (kể cả chồng nhau, emoji hai code unit) là việc của
 * `HighlightedText` dùng chung; nhãn trợ năng đọc CẢ snippet nên do hàng kết quả gắn, không đọc từng đoạn rời.
 */
export function HighlightedSnippet({
  className = 'text-body-md text-fg-2',
  highlights,
  numberOfLines = 3,
  snippet,
}: HighlightedSnippetProps) {
  return (
    <HighlightedText
      className={className}
      highlightClassName={HIGHLIGHT_CLASS}
      highlights={highlights}
      numberOfLines={numberOfLines}
      text={snippet}
    />
  );
}

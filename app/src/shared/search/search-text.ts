/** Giới hạn từ khoá — mặc định khớp `LIMITS.search` của BE, ghi đè bằng `GET /capabilities` → `limits.search`. */
export interface SearchLimits {
  queryMin: number;
  queryMax: number;
  maxTerms: number;
}

export const DEFAULT_SEARCH_LIMITS: SearchLimits = { queryMin: 2, queryMax: 100, maxTerms: 8 };

export type SearchTextIssue = 'empty' | 'too-short' | 'too-long' | 'too-many-terms';

export interface SearchTextCheck {
  /** Đã `trim` + gom khoảng trắng — chuỗi THẬT SỰ gửi đi. */
  text: string;
  /** `null` = hợp lệ, được gọi API. */
  issue: SearchTextIssue | null;
}

/** Gợi ý hiện ngay trong màn — client CHẶN TRƯỚC để không tốn lượt 30 lần/phút cho từ khoá chắc chắn bị `SRCH_*`. */
export const SEARCH_ISSUE_HINT: Record<SearchTextIssue, string> = {
  empty: 'Nhập từ khoá để tìm tin nhắn.',
  'too-short': 'Nhập ít nhất 2 ký tự.',
  'too-long': 'Từ khoá quá dài, hãy rút gọn.',
  'too-many-terms': 'Từ khoá có quá nhiều từ, hãy rút gọn.',
};

/**
 * Đếm gần đúng theo code point (`Array.from`) rồi chuẩn hoá NFC trước: tiếng Việt gõ Telex có thể ra chuỗi tổ hợp
 * (chữ + dấu rời) — NFC gom lại một ký tự như BE (`normalize`). Emoji ghép ZWJ đếm dư (chỉ xấp xỉ) nhưng lệch ở biên
 * 100 ký tự không quan trọng: BE là nơi quyết định cuối cùng và trả `SRCH_*` nếu bất đồng.
 */
export function validateSearchText(
  raw: string,
  limits: SearchLimits = DEFAULT_SEARCH_LIMITS,
): SearchTextCheck {
  const text = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (text.length === 0) return { text, issue: 'empty' };
  const length = Array.from(text).length;
  if (length < limits.queryMin) return { text, issue: 'too-short' };
  if (length > limits.queryMax) return { text, issue: 'too-long' };
  if (text.split(' ').length > limits.maxTerms) return { text, issue: 'too-many-terms' };
  return { text, issue: null };
}

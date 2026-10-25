import { LIMITS } from "../../../core/constants/limits";

/**
 * Hàm THUẦN cho nội dung biên bản (markdown-lite): trích đoạn ngắn cho thẻ trong nhóm chat và kiểm "rỗng". Không I/O — test bảng ở
 * `tests/recap-content.test.ts`. Cú pháp markdown-lite của app: `**đậm**`, `_nghiêng_`, danh sách `- `, việc cần làm `- [ ]`, tiêu đề nhỏ `### `.
 */

const segmenter = new Intl.Segmenter("vi", { granularity: "grapheme" });

/** Cắt còn tối đa `max` grapheme (giữ nguyên emoji ghép); bị cắt thì thêm "…". */
export function truncateGraphemes(text: string, max: number): string {
  const parts = Array.from(segmenter.segment(text), (s) => s.segment);
  return parts.length <= max ? text : `${parts.slice(0, max).join("").trimEnd()}…`;
}

const LINE_PREFIX = /^(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/;

/** Bỏ ký hiệu markdown-lite của MỘT dòng để đọc như văn bản thường. */
function plainLine(line: string): string {
  return line
    .replace(LINE_PREFIX, "")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(\*|_)(.+?)\1/g, "$2")
    .trim();
}

/** Đoạn trích đầu biên bản: tối đa `maxLines` dòng có chữ (bỏ dòng trống), bỏ ký hiệu markdown, cắt còn `maxChars` grapheme. */
export function recapExcerpt(markdown: string, maxChars: number = LIMITS.meetingRecap.excerptChars, maxLines = 4): string {
  const lines = markdown
    .split(/\r?\n/)
    .map(plainLine)
    .filter((l) => l.length > 0)
    .slice(0, maxLines);
  return truncateGraphemes(lines.join("\n"), maxChars);
}

/** Biên bản "rỗng" = không có chữ nào (chỉ khoảng trắng/dòng trống). */
export const isBlankRecap = (content: string): boolean => content.trim().length === 0;

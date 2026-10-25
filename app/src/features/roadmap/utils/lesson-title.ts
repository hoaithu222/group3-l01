/**
 * Tiêu đề buổi học để HIỂN THỊ.
 *
 * ⚠️ Giáo trình nhập từ Markdown lấy H1 làm `title`, và H1 đã ghi sẵn tiền tố: "Buổi 01: Giới thiệu lộ trình…",
 * "Ngày 25 (tuỳ chọn): Thử thách…". Mọi chỗ vẽ buổi học lại tự ghép mã `${lessonLabel} ${number}` ⇒ không bỏ tiền tố
 * thì ra "Buổi 1 · Buổi 01: Giới thiệu…" (ảnh chụp thật) — lặp chữ, và tiêu đề dài thêm một dòng.
 *
 * ⛔ Không sửa dữ liệu ở BE: `title` còn là khoá tìm kiếm (`normalizedTitle`) và admin sửa tay được — app chỉ đổi CÁCH
 * HIỂN THỊ. Chỉ bỏ khi số trong tiền tố KHỚP `number` của buổi: "Buổi 3: …" nằm trên buổi 5 là dữ liệu cố ý, giữ nguyên.
 */

/** Thuật ngữ đơn vị buổi hay gặp trong giáo trình, ngoài `lessonLabel` của chính môn. */
const GENERIC_LABELS = ['Buổi', 'Ngày', 'Bài', 'Tuần', 'Lesson', 'Day', 'Unit'];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "Buổi 01: Giới thiệu HTTP" (buổi 1) → "Giới thiệu HTTP". Không khớp khuôn ⇒ trả nguyên văn (đã `trim`). */
export function lessonDisplayTitle(title: string, lessonLabel: string, number: number): string {
  const trimmed = title.trim();
  const labels = Array.from(new Set([lessonLabel, ...GENERIC_LABELS]))
    .filter(Boolean)
    .map(escapeRegExp)
    .join('|');
  // `0*(\d+)` nuốt số 0 đứng đầu ("01"); `(\(...\))?` cho "(tuỳ chọn)"; dấu tách: `:` `.` `-` `–` `—` `·` `|`.
  const prefix = new RegExp(`^(?:${labels})\\s*0*(\\d+)\\s*(?:\\([^)]*\\))?\\s*[:.\\-–—·|]\\s*`, 'i');
  const match = prefix.exec(trimmed);
  if (!match || Number(match[1]) !== number) return trimmed;
  const rest = trimmed.slice(match[0].length).trim();
  return rest.length > 0 ? rest : trimmed;
}

/** Mã ngắn của buổi theo thuật ngữ của môn — "Buổi 12" / "Ngày 12" (app.md §7.7). */
export function lessonCode(lessonLabel: string, number: number): string {
  return `${lessonLabel} ${String(number)}`;
}

/**
 * Thanh chèn nhanh của trình soạn biên bản (app.md p2-06 §3: Đậm, Nghiêng, Danh sách, Việc cần làm `- [ ]`, Tiêu đề nhỏ). Hàm THUẦN
 * `(chữ, vùng chọn, loại) → (chữ mới, vùng chọn mới)` — `TextInput` không có rich text nên "in đậm" chỉ là bọc `**…**` quanh vùng chọn.
 *
 * ⚠️ IME (Telex/VNI): hàm chỉ chạy khi người dùng BẤM nút trên thanh — lúc đó `text` là giá trị `onChangeText` đã giao (state đồng bộ theo
 * từng phím), không chèn gì giữa lúc bộ gõ đang ghép dấu. Vùng chọn bị kẹp vào độ dài chữ (bộ gõ có thể báo vùng chọn cũ dài hơn chữ).
 */
export type RecapFormat = 'bold' | 'heading' | 'italic' | 'list' | 'todo';

export interface TextSelection {
  end: number;
  start: number;
}

export interface FormatResult {
  selection: TextSelection;
  text: string;
}

const WRAP: Record<'bold' | 'italic', string> = { bold: '**', italic: '_' };
const PREFIX: Record<'heading' | 'list' | 'todo', string> = { heading: '### ', list: '- ', todo: '- [ ] ' };
/** Tiền tố "đầu dòng" đã có — đổi kiểu (danh sách → việc cần làm) thì THAY chứ không chồng `- - [ ] `. */
const ANY_PREFIX = /^(?:#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+)/;

function wrap(text: string, { end, start }: TextSelection, mark: string): FormatResult {
  const next = `${text.slice(0, start)}${mark}${text.slice(start, end)}${mark}${text.slice(end)}`;
  // Vùng chọn rỗng: con trỏ nằm GIỮA cặp dấu để gõ tiếp; có chọn: giữ chọn phần chữ bên trong.
  return { selection: { end: end + mark.length, start: start + mark.length }, text: next };
}

/** Thêm tiền tố cho MỌI dòng trong vùng chọn; mọi dòng đã có đúng tiền tố đó thì bấm lần hai là gỡ. */
function prefixLines(text: string, { end, start }: TextSelection, prefix: string): FormatResult {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const newlineAfter = text.indexOf('\n', end);
  const lineEnd = newlineAfter < 0 ? text.length : newlineAfter;
  const lines = text.slice(lineStart, lineEnd).split('\n');
  const allHave = lines.every((line) => line.startsWith(prefix));
  const block = lines.map((line) => (allHave ? line.slice(prefix.length) : `${prefix}${line.replace(ANY_PREFIX, '')}`)).join('\n');
  const cursor = lineStart + block.length;
  return { selection: { end: cursor, start: cursor }, text: text.slice(0, lineStart) + block + text.slice(lineEnd) };
}

export function applyRecapFormat(text: string, selection: TextSelection, kind: RecapFormat): FormatResult {
  const start = Math.min(Math.max(0, selection.start), text.length);
  const safe = { end: Math.min(Math.max(selection.end, start), text.length), start };
  if (kind === 'bold' || kind === 'italic') return wrap(text, safe, WRAP[kind]);
  return prefixLines(text, safe, PREFIX[kind]);
}

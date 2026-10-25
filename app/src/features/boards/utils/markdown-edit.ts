/**
 * Thanh chèn nhanh của trình sửa mô tả (app.md §3 DescriptionEditor: **B**, *I*, danh sách, code).
 * Hàm THUẦN `(chữ, vùng chọn, loại) → (chữ mới, vùng chọn mới)` — `TextInput` của React Native
 * không có rich text nên "in đậm" chỉ là bọc `**…**` quanh vùng chọn.
 */
export type FormatKind = 'bold' | 'code' | 'italic' | 'list';

export interface TextSelection {
  end: number;
  start: number;
}

const WRAP: Record<'bold' | 'italic', string> = { bold: '**', italic: '_' };

function wrap(text: string, selection: TextSelection, mark: string) {
  const { end, start } = selection;
  const inner = text.slice(start, end);
  const next = `${text.slice(0, start)}${mark}${inner}${mark}${text.slice(end)}`;
  // Vùng chọn rỗng: con trỏ nằm GIỮA cặp dấu để gõ tiếp; có chọn: giữ chọn phần chữ bên trong.
  return { selection: { end: end + mark.length, start: start + mark.length }, text: next };
}

function codeFormat(text: string, selection: TextSelection) {
  const inner = text.slice(selection.start, selection.end);
  if (!inner.includes('\n')) return wrap(text, selection, '`');
  const block = `\`\`\`\n${inner}\n\`\`\``;
  const next = text.slice(0, selection.start) + block + text.slice(selection.end);
  return {
    selection: { end: selection.start + block.length, start: selection.start + block.length },
    text: next,
  };
}

/** Thêm `- ` đầu mọi dòng nằm trong vùng chọn (dòng đã là mục danh sách thì bỏ dấu — bấm lần hai là gỡ). */
function listFormat(text: string, selection: TextSelection) {
  const lineStart = text.lastIndexOf('\n', selection.start - 1) + 1;
  const newlineAfter = text.indexOf('\n', selection.end);
  const lineEnd = newlineAfter < 0 ? text.length : newlineAfter;
  const lines = text.slice(lineStart, lineEnd).split('\n');
  const allListed = lines.every((line) => line.startsWith('- '));
  const changed = lines.map((line) =>
    allListed ? line.slice(2) : line.startsWith('- ') ? line : `- ${line}`,
  );
  const block = changed.join('\n');
  const next = text.slice(0, lineStart) + block + text.slice(lineEnd);
  const cursor = lineStart + block.length;
  return { selection: { end: cursor, start: cursor }, text: next };
}

export function applyFormat(
  text: string,
  selection: TextSelection,
  kind: FormatKind,
): { selection: TextSelection; text: string } {
  const safe = {
    end: Math.min(Math.max(selection.end, selection.start), text.length),
    start: Math.min(selection.start, text.length),
  };
  if (kind === 'list') return listFormat(text, safe);
  if (kind === 'code') return codeFormat(text, safe);
  return wrap(text, safe, WRAP[kind]);
}

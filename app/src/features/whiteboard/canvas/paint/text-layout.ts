/** Tỉ lệ cao dòng / cỡ chữ — khớp `estimateTextSize` của engine (1.25) để hộp chọn của chữ vừa tạo và hộp đo thật không lệch. */
export const LINE_HEIGHT_RATIO = 1.25;

/** Đo bề rộng (đơn vị thế giới) của MỘT dòng chữ ở cỡ chữ đã biết. */
export type MeasureFn = (text: string) => number;

/** Xấp xỉ khi chưa có font (Jest, Skia chưa nạp): 0,6 × cỡ chữ mỗi ký tự — cùng con số của `estimateTextSize` trong engine. */
export const estimateMeasure =
  (fontSize: number): MeasureFn =>
  (text) =>
    text.length * fontSize * 0.6;

/** Chia một từ quá dài thành các đoạn vừa `maxWidth` theo KÝ TỰ (tiếng Việt có dấu tổ hợp ⇒ đi theo code point, không cắt giữa cụm). */
function breakWord(word: string, maxWidth: number, measure: MeasureFn): string[] {
  const parts: string[] = [];
  let current = '';
  for (const ch of word) {
    if (current !== '' && measure(current + ch) > maxWidth) {
      parts.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current !== '') parts.push(current);
  return parts;
}

/**
 * Ngắt dòng THAM LAM theo từ cho giấy nhớ (khung cố định): xuống dòng cứng `\n` được giữ; từ dài hơn `maxWidth` bị chia theo ký tự; `maxWidth ≤ 0`
 * nghĩa là không ngắt mềm (chữ tự do — hộp giãn theo chữ). Luôn trả ≥ 1 dòng để nơi vẽ không phải xử lý mảng rỗng.
 */
export function wrapText(text: string, maxWidth: number, measure: MeasureFn): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (maxWidth <= 0 || paragraph === '') {
      out.push(paragraph);
      continue;
    }
    let line = '';
    for (const word of paragraph.split(' ')) {
      const candidate = line === '' ? word : `${line} ${word}`;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line !== '') out.push(line);
      const pieces = measure(word) > maxWidth ? breakWord(word, maxWidth, measure) : [word];
      out.push(...pieces.slice(0, -1));
      line = pieces[pieces.length - 1] ?? '';
    }
    out.push(line);
  }
  return out.length > 0 ? out : [''];
}

/** Hộp bao của chữ TỰ DO (không ngắt mềm): rộng = dòng dài nhất, cao = số dòng × cao dòng. Tối thiểu một ô cỡ chữ để hộp chọn không xẹp về 0. */
export function textBox(
  text: string,
  fontSize: number,
  measure: MeasureFn,
): { h: number; w: number } {
  const lines = text.split('\n');
  const widest = lines.reduce((max, line) => Math.max(max, measure(line)), 0);
  return { h: lines.length * fontSize * LINE_HEIGHT_RATIO, w: Math.max(fontSize, widest) };
}

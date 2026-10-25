const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/gi;
/** Dấu câu cuối câu dính vào URL ("xem tại https://a.vn.") không thuộc liên kết. */
const TRAILING_PUNCTUATION = /[).,;:!?]+$/;

export interface TextPart {
  link: boolean;
  text: string;
}

/**
 * Tách chữ thường và liên kết `http(s)` để dựng chữ bấm được. Dấu câu cuối liên kết được trả lại làm chữ thường. Hàm THUẦN.
 * ⚠️ Chỉ `http(s)`: `javascript:`/`intent:`/`tel:` do người lạ gõ không bao giờ thành liên kết bấm được.
 */
export function splitLinks(source: string): TextPart[] {
  return source
    .split(URL_PATTERN)
    .filter((piece) => piece.length > 0)
    .flatMap<TextPart>((piece) => {
      if (!/^https?:\/\//i.test(piece)) return [{ link: false, text: piece }];
      const tail = TRAILING_PUNCTUATION.exec(piece)?.[0] ?? '';
      const url = tail ? piece.slice(0, -tail.length) : piece;
      return tail
        ? [
            { link: true, text: url },
            { link: false, text: tail },
          ]
        : [{ link: true, text: url }];
    });
}

import type { CodeLanguage, Token } from "../types";
import { KEYWORDS } from "./code-keywords";
import { SPECS, type LangSpec } from "./code-lang-spec";

/**
 * Lexer mã nguồn theo HỌ ngôn ngữ (README §2 "Chuẩn hoá mã nguồn"): bỏ chú thích + khoảng trắng; định danh → `I`; chuỗi
 * và số → `L`; giữ từ khoá và toán tử/dấu. Nhờ vậy đổi tên biến, đổi literal, thêm/bớt chú thích, định dạng lại (kể cả
 * thụt lề Python) đều cho CÙNG một dãy token (PLAG-04). Cố ý KHÔNG dựng cây cú pháp (AST là P2): đổi cấu trúc
 * (for↔while, tách hàm, đảo điều kiện) là dãy token khác — giới hạn cần ghi rõ trên UI.
 *
 * Lexer chịu lỗi: chuỗi/chú thích chưa đóng không ném lỗi (chuỗi một dòng dừng ở cuối dòng để một dấu nháy lạc không
 * nuốt cả tệp; chú thích khối chưa đóng ăn đến hết tệp), ký tự lạ thành token một ký tự. Giới hạn đã biết: chưa nhận
 * literal regex JS (`/a\//` có thể bị hiểu nhầm là chú thích một dòng), HTML coi dấu nháy trong nội dung chữ là mở chuỗi,
 * `<script>`/`<style>` nhúng được lex như HTML/CSS thường.
 */

export const IDENTIFIER_TOKEN = "I";
export const LITERAL_TOKEN = "L";

// Dấu tổ hợp (thuộc tính Unicode M) nằm trong định danh để tên tiếng Việt ở dạng NFD (chữ "o" rồi hai dấu rời rồi "ng") vẫn là MỘT định danh.
const IDENT = /[\p{L}_$][\p{L}\p{M}\p{N}_$]*/uy;
const MARKUP_IDENT = /(?:--|-?[\p{L}_])[\p{L}\p{M}\p{N}_-]*/uy;
const NUMBER_BODY = String.raw`(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.\d[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?)[\p{L}]*`;
const NUMBER = new RegExp(NUMBER_BODY, "uy");
const MARKUP_NUMBER = new RegExp(`${NUMBER_BODY}%?`, "uy");
const HEX_COLOR = /#[\da-fA-F]{3,8}(?![\p{L}\p{N}_-])/uy;
const STRING_PREFIX = /^[rRbBuUfF]{1,2}$/;
const UNICODE_SPACE = /\s/u;

/** Toán tử nhiều ký tự (hợp mọi họ; `//` chỉ tới được đây ở họ không coi `//` là chú thích, vd Python `//` chia nguyên). */
const OPS3 = new Set(["===", "!==", "<<=", ">>=", ">>>", "...", "**=", "&&=", "||=", "??=", "<=>", "//="]);
const OPS2 = new Set([
  "==", "!=", "<=", ">=", "&&", "||", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<", ">>", "->", "=>",
  "::", "??", "?.", "**", "..", "<>", ":=", "<-", "//", "~=", "$=",
]);

/** Trả về offset ngay SAU chuỗi bắt đầu tại `start` (mở bằng `open`). Không bao giờ ném lỗi. */
function scanString(src: string, start: number, open: string, spec: LangSpec, multiline: boolean): number {
  const n = src.length;
  const single = open.length === 1;
  let j = start + open.length;
  while (j < n) {
    const c = src[j];
    if (spec.backslashEscape && c === "\\") {
      j += 2;
    } else if (c === "\n" && !multiline) {
      return j;
    } else if (src.startsWith(open, j)) {
      if (single && spec.doubledQuoteEscape && src[j + 1] === open) j += 2;
      else return j + open.length;
    } else {
      j++;
    }
  }
  return n;
}

/** Nếu tại `i` bắt đầu một chuỗi/định danh-trong-nháy thì trả token và điểm kết thúc. */
function matchQuoted(src: string, i: number, spec: LangSpec): { value: string; end: number } | null {
  for (const t of spec.tripleQuotes) {
    if (src.startsWith(t, i)) return { value: LITERAL_TOKEN, end: scanString(src, i, t, spec, true) };
  }
  const c = src[i];
  if (spec.quotes.includes(c)) return { value: LITERAL_TOKEN, end: scanString(src, i, c, spec, false) };
  if (spec.multilineQuotes.includes(c)) return { value: LITERAL_TOKEN, end: scanString(src, i, c, spec, true) };
  if (spec.quotedIdentifiers.includes(c)) return { value: IDENTIFIER_TOKEN, end: scanString(src, i, c, spec, false) };
  return null;
}

/** Nếu tại `i` bắt đầu chú thích thì trả offset kết thúc (> i), ngược lại trả `i`. */
function skipComment(src: string, i: number, spec: LangSpec): number {
  for (const open of spec.lineComments) {
    if (src.startsWith(open, i)) {
      const e = src.indexOf("\n", i);
      return e < 0 ? src.length : e;
    }
  }
  for (const [open, close] of spec.blockComments) {
    if (src.startsWith(open, i)) {
      const e = src.indexOf(close, i + open.length);
      return e < 0 ? src.length : e + close.length;
    }
  }
  return i;
}

const isDigit = (code: number): boolean => code >= 48 && code <= 57;

/** HTML: token ngay trước là `<` hoặc `</` → từ này là tên thẻ. */
function isTagName(tokens: readonly Token[]): boolean {
  const n = tokens.length;
  const prev = n > 0 ? tokens[n - 1].value : "";
  return prev === "<" || (prev === "/" && n > 1 && tokens[n - 2].value === "<");
}

function matchSticky(re: RegExp, src: string, at: number): string | null {
  re.lastIndex = at;
  const m = re.exec(src);
  return m ? m[0] : null;
}

/**
 * Tách mã nguồn thành token chuẩn hoá kèm offset [start, end) trong `source` gốc. Rỗng/chỉ chú thích → `[]`. Tất định,
 * O(độ dài), không ném lỗi với đầu vào bất kỳ.
 */
export function tokenizeCode(source: string, language: CodeLanguage): Token[] {
  const spec = SPECS[language];
  const keywords = KEYWORDS[language];
  const identRe = spec.markup ? MARKUP_IDENT : IDENT;
  const numberRe = spec.markup ? MARKUP_NUMBER : NUMBER;
  const tokens: Token[] = [];
  const n = source.length;
  const push = (value: string, start: number, end: number): void => {
    tokens.push({ value, start, end });
  };

  let i = 0;
  while (i < n) {
    const code = source.charCodeAt(i);
    if (code <= 32 || (code >= 0x80 && UNICODE_SPACE.test(source[i]))) {
      i++;
      continue;
    }
    const afterComment = skipComment(source, i, spec);
    if (afterComment > i) {
      i = afterComment;
      continue;
    }
    const quoted = matchQuoted(source, i, spec);
    if (quoted) {
      push(quoted.value, i, quoted.end);
      i = quoted.end;
      continue;
    }
    const num = isDigit(code) || (code === 46 && isDigit(source.charCodeAt(i + 1))) ? matchSticky(numberRe, source, i) : null;
    if (num) {
      push(LITERAL_TOKEN, i, i + num.length);
      i += num.length;
      continue;
    }
    const word = matchSticky(identRe, source, i);
    if (word) {
      const end = i + word.length;
      const prefixed = spec.stringPrefix && STRING_PREFIX.test(word) ? matchQuoted(source, end, spec) : null;
      if (prefixed) {
        push(LITERAL_TOKEN, i, prefixed.end);
        i = prefixed.end;
        continue;
      }
      const key = spec.ignoreCase ? word.toLowerCase() : word;
      if (keywords.has(key)) push(key, i, end);
      else if (spec.markup && isTagName(tokens)) push(key.toLowerCase(), i, end);
      else push(IDENTIFIER_TOKEN, i, end);
      i = end;
      continue;
    }
    const color = spec.markup && code === 35 ? matchSticky(HEX_COLOR, source, i) : null;
    if (color) {
      push(LITERAL_TOKEN, i, i + color.length);
      i += color.length;
      continue;
    }
    const three = source.slice(i, i + 3);
    const two = three.slice(0, 2);
    const opLen = OPS3.has(three) ? 3 : OPS2.has(two) ? 2 : (source.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
    push(source.slice(i, i + opLen), i, i + opLen);
    i += opLen;
  }
  return tokens;
}

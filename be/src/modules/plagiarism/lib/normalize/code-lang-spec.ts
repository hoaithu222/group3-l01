import type { CodeLanguage } from "../types";

/**
 * Cấu hình lexer theo HỌ ngôn ngữ (chú thích, dạng chuỗi, cách escape, tiền tố chuỗi…) — tách khỏi vòng quét trong
 * `code-tokenizer.ts` để thêm/sửa họ ngôn ngữ chỉ là sửa bảng này. Từ khoá từng họ ở `code-keywords.ts`.
 */
export interface LangSpec {
  lineComments: readonly string[];
  blockComments: readonly (readonly [open: string, close: string])[];
  /** Nháy mở/đóng chuỗi MỘT dòng (chưa đóng thì dừng ở cuối dòng). */
  quotes: readonly string[];
  /** Nháy chuỗi có thể nhiều dòng (template literal JS, raw string Go). */
  multilineQuotes: readonly string[];
  tripleQuotes: readonly string[];
  backslashEscape: boolean;
  /** SQL: `''` bên trong chuỗi là một dấu nháy, không phải kết thúc chuỗi. */
  doubledQuoteEscape: boolean;
  /** Python: tiền tố chuỗi `r"…"`, `b'…'`, `f"…"`, `rb"…"`. */
  stringPrefix: boolean;
  /** Định danh đặt trong nháy (SQL `"col"`, `` `col` ``) → `I`. */
  quotedIdentifiers: readonly string[];
  /** SQL: từ khoá không phân biệt hoa/thường (đưa về chữ thường). */
  ignoreCase: boolean;
  /** HTML/CSS: giữ tên thẻ sau `<`/`</`, nhận màu `#fff`, số có `%`. */
  markup: boolean;
}

const BASE: LangSpec = {
  lineComments: [],
  blockComments: [],
  quotes: ['"', "'"],
  multilineQuotes: [],
  tripleQuotes: [],
  backslashEscape: true,
  doubledQuoteEscape: false,
  stringPrefix: false,
  quotedIdentifiers: [],
  ignoreCase: false,
  markup: false,
};

export const SPECS: Record<CodeLanguage, LangSpec> = {
  "c-like": { ...BASE, lineComments: ["//"], blockComments: [["/*", "*/"]], multilineQuotes: ["`"], tripleQuotes: ['"""'] },
  python: { ...BASE, lineComments: ["#"], tripleQuotes: ['"""', "'''"], stringPrefix: true },
  sql: {
    ...BASE,
    lineComments: ["--"],
    blockComments: [["/*", "*/"]],
    quotes: ["'"],
    backslashEscape: false,
    doubledQuoteEscape: true,
    quotedIdentifiers: ['"', "`"],
    ignoreCase: true,
  },
  markup: {
    ...BASE,
    blockComments: [
      ["<!--", "-->"],
      ["/*", "*/"],
    ],
    backslashEscape: false,
    markup: true,
  },
};

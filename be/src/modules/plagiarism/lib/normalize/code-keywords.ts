import type { CodeLanguage } from "../types";

/**
 * Từ khoá GIỮ NGUYÊN khi chuẩn hoá mã nguồn (README §2: "định danh → I, chuỗi/số → L, giữ từ khoá/toán tử").
 *
 * Chỉ liệt kê từ khoá DÀNH RIÊNG + kiểu nguyên thuỷ. Từ khoá "mềm" hoặc từ hay bị dùng làm tên biến (data, get, set, from,
 * type, open, out, map, range, select, number, val, base, ref, lock, checked, template, extension, init…) cố ý KHÔNG có
 * ở đây: nếu có, sinh viên đổi tên biến `number` → `n` sẽ làm token đổi từ từ khoá sang `I` và lách được việc chuẩn hoá.
 * Tên hàm/lớp thư viện (print, len, String, List) cũng là định danh `I` — đổi tên hàm tự viết và gọi hàm thư viện đều về
 * cùng một token.
 */
const words = (s: string): ReadonlySet<string> => new Set(s.split(/\s+/).filter(Boolean));

/** Họ C: JS/TS, Java, Kotlin, Swift, C/C++, C#, Go, PHP — hợp của từ khoá dành riêng các ngôn ngữ đó. */
const C_LIKE = words(`
  abstract as assert async await bool boolean break byte case catch char class const constexpr continue debugger decimal
  default defer delete do double echo else elseif enum explicit export extends extern false fallthrough final finally
  float for foreach fun func function goto guard if implements implicit import in inline instanceof int interface
  internal is isset let long namespace native new nil null operator override package private protected protocol public
  readonly register require return sealed self short signed sizeof static string struct super switch synchronized this
  throw throws trait transient true try typedef typeof uint ulong union unset unsafe unsigned using var virtual void
  volatile while with yield
`);

/** Python (kèm `def`/`lambda`…); Ruby dùng chung họ này về chú thích `#` nhưng KHÔNG thêm từ khoá Ruby (vd `end` là tên biến Python phổ biến). */
const PYTHON = words(`
  False None True and as assert async await break class continue def del elif else except finally for from global if
  import in is lambda nonlocal not or pass raise return try while with yield
`);

/** SQL (so khớp không phân biệt hoa/thường): câu lệnh, mệnh đề, hàm gộp và kiểu dữ liệu thường gặp. */
const SQL = words(`
  select from where and or not null is in between like ilike exists case when then else end as on join inner left right
  full outer cross natural using group by order having limit offset union all intersect except distinct insert into
  values update set delete create alter drop table view index database schema primary key foreign references constraint
  default unique check asc desc with recursive returning begin commit rollback transaction grant revoke truncate if
  cascade restrict add column rename to true false count sum avg min max coalesce cast varchar char int integer bigint
  smallint decimal numeric float double boolean serial
`);

/** HTML/CSS không có "từ khoá"; tên thẻ HTML được giữ riêng trong lexer (sau `<`, `</`). */
const MARKUP: ReadonlySet<string> = new Set();

export const KEYWORDS: Record<CodeLanguage, ReadonlySet<string>> = {
  "c-like": C_LIKE,
  python: PYTHON,
  sql: SQL,
  markup: MARKUP,
};

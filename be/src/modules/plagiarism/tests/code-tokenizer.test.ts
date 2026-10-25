import fc from "fast-check";
import { IDENTIFIER_TOKEN as I, LITERAL_TOKEN as L, tokenizeCode } from "../lib/normalize/code-tokenizer";
import { CODE_LANGUAGES, type CodeLanguage } from "../lib/types";

const vals = (src: string, lang: CodeLanguage): string[] => tokenizeCode(src, lang).map((t) => t.value);

describe("tokenizeCode — họ C (c-like)", () => {
  const original = `function sum(arr) {
  let total = 0;
  for (let i = 0; i < arr.length; i++) {
    total += arr[i];
  }
  return total;
}`;

  it("PLAG-04: đổi tên biến/hàm, đổi literal, thêm chú thích, định dạng lại → CÙNG dãy token", () => {
    const disguised = `// tính tổng mảng
function addAll(list){let acc=100; /* khởi tạo */
  for(let n=1;n<list.length;n++){acc+=list[n];} // cộng dồn
  return acc;}`;
    expect(vals(disguised, "c-like")).toEqual(vals(original, "c-like"));
    expect(vals(original, "c-like")).toEqual([
      "function", I, "(", I, ")", "{", "let", I, "=", L, ";", "for", "(", "let", I, "=", L, ";", I, "<", I, ".", I, ";", I, "++", ")", "{",
      I, "+=", I, "[", I, "]", ";", "}", "return", I, ";", "}",
    ]);
  });

  it("chú thích dòng và khối bị bỏ; chuỗi chứa // hoặc /* không bị hiểu là chú thích", () => {
    expect(vals("a = 1; // ghi chú\n/* nhiều\ndòng */ b = 2;", "c-like")).toEqual([I, "=", L, ";", I, "=", L, ";"]);
    expect(vals('const url = "http://x.com/*y*/"; // thật', "c-like")).toEqual(["const", I, "=", L, ";"]);
    expect(vals("const re = '//'; x();", "c-like")).toEqual(["const", I, "=", L, ";", I, "(", ")", ";"]);
  });

  it("chuỗi: nháy đơn/kép có escape, template literal nhiều dòng, text block — mỗi cái một L", () => {
    expect(vals('s = "a\\"b" + \'c\\\'d\';', "c-like")).toEqual([I, "=", L, "+", L, ";"]);
    expect(vals("t = `dòng 1\ndòng ${x} 2`;", "c-like")).toEqual([I, "=", L, ";"]);
    expect(vals('String s = """\n  khối\n  chữ\n""";', "c-like")).toEqual([I, I, "=", L, ";"]);
  });

  it("từ khoá và toán tử được giữ (kể cả toán tử nhiều ký tự); từ khoá mềm như `number` là định danh", () => {
    expect(vals("if (x) { return null; } else { throw new Error('e'); }", "c-like")).toEqual([
      "if", "(", I, ")", "{", "return", "null", ";", "}", "else", "{", "throw", "new", I, "(", L, ")", ";", "}",
    ]);
    expect(vals("a === b && c !== d || e >= f ?? g => h -> i :: j ... k", "c-like")).toEqual([
      I, "===", I, "&&", I, "!==", I, "||", I, ">=", I, "??", I, "=>", I, "->", I, "::", I, "...", I,
    ]);
    expect(vals("x++ + ++y", "c-like")).toEqual([I, "++", "+", "++", I]);
    expect(vals("number = 5", "c-like")).toEqual([I, "=", L]);
  });

  it("mọi dạng số → L", () => {
    expect(vals("0x1F 1_000 3.14 1e-9 10n .5 0b101 5f 0o17", "c-like")).toEqual(Array(9).fill(L));
    expect(vals("obj.a.b", "c-like")).toEqual([I, ".", I, ".", I]);
  });

  it("định danh Unicode (tên biến tiếng Việt, cả NFD) là một I; BOM đầu tệp bị bỏ qua", () => {
    expect(vals("let tổng = 0;", "c-like")).toEqual(["let", I, "=", L, ";"]);
    expect(vals("let tổng = 0;".normalize("NFD"), "c-like")).toEqual(["let", I, "=", L, ";"]);
    const tokens = tokenizeCode("\uFEFFint x;", "c-like");
    expect(tokens.map((t) => t.value)).toEqual(["int", I, ";"]);
    expect(tokens[0].start).toBe(1);
  });

  it("offset [start, end) cắt đúng văn bản gốc của từng token (kể cả chuỗi tiếng Việt, emoji ngoài chuỗi)", () => {
    const src = 'let name = "Việt"; a 😀 b';
    const tokens = tokenizeCode(src, "c-like");
    expect(tokens.map((t) => src.slice(t.start, t.end))).toEqual(["let", "name", "=", '"Việt"', ";", "a", "😀", "b"]);
  });

  it("KHÔNG bảo đảm bắt đổi cấu trúc: for ↔ while cho dãy token khác (giới hạn đã ghi trong README, AST là P2)", () => {
    const forLoop = "for (let i = 0; i < n; i++) { s += i; }";
    const whileLoop = "let i = 0; while (i < n) { s += i; i++; }";
    expect(vals(forLoop, "c-like")).not.toEqual(vals(whileLoop, "c-like"));
  });

  it("chịu lỗi: chuỗi một dòng chưa đóng dừng ở cuối dòng, chú thích khối chưa đóng ăn hết tệp, dấu nháy lạc cuối tệp", () => {
    expect(vals('x = "abc\ny = 2;', "c-like")).toEqual([I, "=", L, I, "=", L, ";"]);
    expect(vals("a /* không bao giờ đóng\nb c", "c-like")).toEqual([I]);
    expect(vals("'", "c-like")).toEqual([L]);
    expect(vals('"a\\', "c-like")).toEqual([L]);
  });
});

describe("tokenizeCode — Python", () => {
  const program = (indent: string): string =>
    ["def total(xs):", `${indent}t = 0`, `${indent}for x in xs:`, `${indent}${indent}if x > 0:`, `${indent}${indent}${indent}t += x`, `${indent}return t`, ""].join("\n");

  it("thụt lề (2 dấu cách, 4 dấu cách, tab) và dòng trống/khoảng trắng thừa không đổi dãy token", () => {
    const four = vals(program("    "), "python");
    expect(vals(program("  "), "python")).toEqual(four);
    expect(vals(program("\t"), "python")).toEqual(four);
    expect(vals(`\n\n${program("    ")}   \n\n`, "python")).toEqual(four);
    expect(four).toEqual(["def", I, "(", I, ")", ":", I, "=", L, "for", I, "in", I, ":", "if", I, ">", L, ":", I, "+=", I, "return", I]);
  });

  it("# là chú thích nhưng '#' trong chuỗi thì không; docstring ba nháy, f-string, tiền tố rb là một L", () => {
    expect(vals('s = "#không phải chú thích"  # thật', "python")).toEqual([I, "=", L]);
    expect(vals('def f():\n    """Mô tả\n    nhiều dòng"""\n    return 1', "python")).toEqual(["def", I, "(", ")", ":", L, "return", L]);
    expect(vals("a = f\"{x} và {y}\" + rb'\\d+' + b\"x\" + u'y'", "python")).toEqual([I, "=", L, "+", L, "+", L, "+", L]);
  });

  it("tên r/f/b đứng riêng (không kề nháy) vẫn là định danh; // là toán tử chia nguyên chứ không phải chú thích", () => {
    expect(vals("r = f(b)", "python")).toEqual([I, "=", I, "(", I, ")"]);
    expect(vals("a // b ** c", "python")).toEqual([I, "//", I, "**", I]);
  });

  it("từ khoá Python giữ nguyên, tên hàm thư viện là I; đổi tên biến không đổi dãy token", () => {
    expect(vals("lambda x: x if x else None", "python")).toEqual(["lambda", I, ":", I, "if", I, "else", "None"]);
    expect(vals("print(len(items))", "python")).toEqual(vals("show(size(rows))", "python"));
  });

  it("Ruby (.rb) dùng họ này: chú thích # bị bỏ, chuỗi là L", () => {
    expect(vals('# xin chào\nputs "hi"', "python")).toEqual([I, L]);
  });
});

describe("tokenizeCode — SQL", () => {
  it("từ khoá không phân biệt hoa/thường, đổi tên bảng/cột/literal không đổi dãy token", () => {
    const a = vals("SELECT Name, Age FROM Users WHERE age >= 18 ORDER BY Name", "sql");
    expect(vals("select ten , tuoi\nfrom sinh_vien where tuoi>=21 order by ten", "sql")).toEqual(a);
    expect(a).toEqual(["select", I, ",", I, "from", I, "where", I, ">=", L, "order", "by", I]);
  });

  it("chú thích -- và /* */ bị bỏ; '' trong chuỗi là một dấu nháy; không có escape bằng backslash", () => {
    expect(vals("-- ghi chú\nselect 1 /* x */ ;", "sql")).toEqual(["select", L, ";"]);
    expect(vals("select 'it''s ok' || 'b'", "sql")).toEqual(["select", L, "||", L]);
    expect(vals("select 'C:\\' , 2", "sql")).toEqual(["select", L, ",", L]);
  });

  it("định danh trong nháy kép/backtick → I; hàm gộp là từ khoá", () => {
    expect(vals('select "Họ tên", `col` from t', "sql")).toEqual(["select", I, ",", I, "from", I]);
    expect(vals("select count(*) from t", "sql")).toEqual(["select", "count", "(", "*", ")", "from", I]);
  });
});

describe("tokenizeCode — HTML/CSS (markup)", () => {
  it("giữ tên thẻ, thuộc tính → I, giá trị → L, chú thích HTML bị bỏ", () => {
    expect(vals(`<div class="box" id='x'><!-- ẩn --><p>Xin chào</p></div>`, "markup")).toEqual([
      "<", "div", I, "=", L, I, "=", L, ">", "<", "p", ">", I, I, "<", "/", "p", ">", "<", "/", "div", ">",
    ]);
    expect(vals("<DIV><P></P></DIV>", "markup")).toEqual(vals("<div><p></p></div>", "markup"));
  });

  it("CSS: chú thích, màu hex, số có đơn vị/%, số âm, biến --custom", () => {
    expect(vals(".a { color: #fff; margin: -5px 10%; } /* c */", "markup")).toEqual([
      ".", I, "{", I, ":", L, ";", I, ":", "-", L, L, ";", "}",
    ]);
    expect(vals(":root { --main-color: red; }", "markup")).toEqual([":", I, "{", I, ":", I, ";", "}"]);
  });
});

describe("tokenizeCode — tính chất chung", () => {
  it("rỗng / chỉ khoảng trắng / chỉ chú thích → []", () => {
    for (const lang of CODE_LANGUAGES) {
      expect(tokenizeCode("", lang)).toEqual([]);
      expect(tokenizeCode(" \n\t\r\n ", lang)).toEqual([]);
    }
    expect(tokenizeCode("// x\n/* y */", "c-like")).toEqual([]);
    expect(tokenizeCode("# x", "python")).toEqual([]);
    expect(tokenizeCode("-- x", "sql")).toEqual([]);
    expect(tokenizeCode("<!-- x -->", "markup")).toEqual([]);
  });

  it("property: với mọi chuỗi (kể cả surrogate lẻ) không ném lỗi, tất định, offset nằm trong chuỗi, tăng dần, không chồng nhau", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 200 }), fc.constantFrom(...CODE_LANGUAGES), (src, lang) => {
        const tokens = tokenizeCode(src, lang);
        expect(tokenizeCode(src, lang)).toEqual(tokens);
        let prevEnd = 0;
        for (const t of tokens) {
          expect(t.start).toBeGreaterThanOrEqual(prevEnd);
          expect(t.end).toBeGreaterThan(t.start);
          expect(t.end).toBeLessThanOrEqual(src.length);
          prevEnd = t.end;
        }
      }),
      { numRuns: 300 },
    );
  });

  it("chịu được tệp lớn (khoảng 400k ký tự)", () => {
    const line = 'const total = compute(a, b) + 42; // ghi chú\nif (total > 10) { print("xong"); }\n';
    const src = line.repeat(5_000);
    const tokens = tokenizeCode(src, "c-like");
    expect(tokens.length).toBe(5_000 * 25);
  });
});

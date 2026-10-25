import { classifyExtension, classifyFileName } from "../lib/extract/extractor.registry";
import type { TextExtractor } from "../lib/extract/extractor.types";
import { extractMarkdownText, markdownExtractor, stripMarkdown } from "../lib/extract/markdown.extractor";
import { capText, decodeTextBuffer, extractPlainText, plainExtractor } from "../lib/extract/plain.extractor";
import { assessTextQuality } from "../lib/extract/text-quality";
import { normalizeText } from "../lib/normalize/text-normalizer";
import type { CodeLanguage } from "../lib/types";

describe("classifyExtension / classifyFileName (README §7)", () => {
  it("văn bản: pdf, docx, txt, md → TEXT với trình trích tương ứng", () => {
    expect(classifyExtension("pdf")).toEqual({ supported: true, kind: "TEXT", extractor: "pdf", language: null });
    expect(classifyExtension("docx")).toEqual({ supported: true, kind: "TEXT", extractor: "docx", language: null });
    expect(classifyExtension("txt")).toEqual({ supported: true, kind: "TEXT", extractor: "plain", language: null });
    expect(classifyExtension("md")).toEqual({ supported: true, kind: "TEXT", extractor: "markdown", language: null });
  });

  it("mã nguồn: đủ 18 đuôi trong kế hoạch, đúng họ ngôn ngữ, đọc bằng trình trích plain", () => {
    const expected: Record<string, CodeLanguage> = {
      js: "c-like", jsx: "c-like", ts: "c-like", tsx: "c-like", java: "c-like", kt: "c-like", swift: "c-like", c: "c-like", h: "c-like",
      cpp: "c-like", cs: "c-like", go: "c-like", php: "c-like", rb: "python", py: "python", sql: "sql", html: "markup", css: "markup",
    };
    expect(Object.keys(expected)).toHaveLength(18);
    for (const [ext, language] of Object.entries(expected)) {
      expect(classifyExtension(ext)).toEqual({ supported: true, kind: "CODE", extractor: "plain", language });
    }
  });

  it("không phân biệt hoa/thường, chấp nhận dấu chấm đầu và khoảng trắng thừa", () => {
    expect(classifyExtension(".PDF")).toMatchObject({ supported: true, extractor: "pdf" });
    expect(classifyExtension(" Docx ")).toMatchObject({ supported: true, extractor: "docx" });
    expect(classifyExtension(".Py")).toMatchObject({ supported: true, language: "python" });
  });

  it("đuôi khác → UNSUPPORTED (.doc, .pptx, .xlsx, ảnh, nén, rỗng); tên trùng thuộc tính Object không lọt qua", () => {
    for (const ext of ["doc", "pptx", "xlsx", "png", "gz", "zip", "", ".", "constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(classifyExtension(ext)).toEqual({ supported: false });
    }
  });

  it("theo tên tệp: lấy đuôi sau dấu chấm cuối; không đuôi / tệp ẩn / đuôi rỗng → không hỗ trợ", () => {
    expect(classifyFileName("Báo cáo cuối kỳ.final.PDF")).toMatchObject({ supported: true, extractor: "pdf" });
    expect(classifyFileName("main.py")).toMatchObject({ language: "python" });
    for (const name of [".gitignore", "README", "archive.tar.gz", "ghi chú.", "", "slide.pptx"]) {
      expect(classifyFileName(name)).toEqual({ supported: false });
    }
  });
});

describe("decodeTextBuffer", () => {
  it("UTF-8 tiếng Việt nguyên vẹn; bỏ BOM UTF-8; rỗng → rỗng", () => {
    expect(decodeTextBuffer(Buffer.from("Trường Đại học Bách Khoa", "utf8"))).toBe("Trường Đại học Bách Khoa");
    expect(decodeTextBuffer(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("Xin chào", "utf8")]))).toBe("Xin chào");
    expect(decodeTextBuffer(Buffer.alloc(0))).toBe("");
  });

  it("UTF-16 có BOM (Notepad 'Unicode'): LE và BE đều đọc đúng tiếng Việt; byte lẻ cuối bị bỏ, không ném lỗi", () => {
    const le = Buffer.from("Xin chào, thế giới", "utf16le");
    expect(decodeTextBuffer(Buffer.concat([Buffer.from([0xff, 0xfe]), le]))).toBe("Xin chào, thế giới");
    expect(decodeTextBuffer(Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(le).swap16()]))).toBe("Xin chào, thế giới");
    expect(decodeTextBuffer(Buffer.concat([Buffer.from([0xff, 0xfe]), le, Buffer.from([0x41])]))).toBe("Xin chào, thế giới");
  });

  it('"\\r\\n" và "\\r" → "\\n"; ký tự điều khiển (trừ tab/xuống dòng) → dấu cách', () => {
    expect(decodeTextBuffer(Buffer.from("a\r\nb\rc\nd", "utf8"))).toBe("a\nb\nc\nd");
    expect(decodeTextBuffer(Buffer.from("a\u0000b\u0007c\td\ne\u0085f", "utf8"))).toBe("a b c\td\ne f");
  });

  it("byte UTF-8 hỏng thành U+FFFD, không ném lỗi", () => {
    expect(decodeTextBuffer(Buffer.from([0x61, 0xc3, 0x28, 0x62]))).toContain("\u{FFFD}");
  });
});

describe("capText / extractPlainText", () => {
  it("không vượt trần → giữ nguyên; vượt → cắt và báo truncated; không cắt đôi cặp thay thế (emoji)", () => {
    expect(capText("abc", 3)).toEqual({ text: "abc", truncated: false });
    expect(capText("abcdef", 4)).toEqual({ text: "abcd", truncated: true });
    expect(capText("ab😀cd", 3)).toEqual({ text: "ab", truncated: true });
    expect(capText("ab😀cd", 4)).toEqual({ text: "ab😀", truncated: true });
    expect(capText("abc", 0)).toEqual({ text: "", truncated: true });
  });

  it("chỉ khoảng trắng / rỗng / chỉ BOM → NO_TEXT", () => {
    for (const s of ["", "  \n\t ", "\u{FEFF}"]) {
      expect(extractPlainText({ buffer: Buffer.from(s, "utf8"), charsMax: 100 })).toEqual({ ok: false, reason: "NO_TEXT" });
    }
  });

  it("có chữ → ok, cắt theo charsMax và báo truncated", () => {
    const buffer = Buffer.from("Một hai ba bốn năm sáu bảy", "utf8");
    expect(extractPlainText({ buffer, charsMax: 1000 })).toEqual({ ok: true, text: "Một hai ba bốn năm sáu bảy", truncated: false });
    expect(extractPlainText({ buffer, charsMax: 7 })).toEqual({ ok: true, text: "Một hai", truncated: true });
  });

  it("trình trích thoả interface TextExtractor (chỗ cắm cho PDF/DOCX ở bước sau)", async () => {
    const fakePdf: TextExtractor = { id: "pdf", extract: () => Promise.resolve({ ok: false, reason: "NO_TEXT" }) };
    expect(fakePdf.id).toBe("pdf");
    await expect(plainExtractor.extract({ buffer: Buffer.from("xin chào"), charsMax: 100 })).resolves.toMatchObject({ ok: true });
    expect(plainExtractor.id).toBe("plain");
  });
});

describe("stripMarkdown / extractMarkdownText", () => {
  const md = [
    "# Tiêu đề bài",
    "",
    "Đoạn có **đậm**, *nghiêng*, `mã` và [liên kết](https://example.com/trang?x=1) cùng ![ảnh minh hoạ](img/a.png).",
    "",
    "> Trích dẫn ở đây",
    "- Mục một",
    "* Mục hai",
    "1. Mục ba",
    "",
    "```js",
    "const a = 1;",
    "```",
    "",
    "| Cột A | Cột B |",
    "| --- | --- |",
    "| 1 | 2 |",
    "",
    "---",
    "<!-- ghi chú ẩn -->",
    "Xem <b>thẻ</b> HTML.",
    "[ref]: https://example.com/ref",
  ].join("\n");

  it("giữ chữ người viết (kể cả nội dung khối mã), bỏ địa chỉ link/ảnh, thẻ HTML, chú thích, định dạng", () => {
    const out = stripMarkdown(md);
    expect(normalizeText(out)).toBe(
      "tieu de bai doan co dam nghieng ma va lien ket cung anh minh hoa trich dan o day muc mot muc hai muc ba const a 1 cot a cot b 1 2 xem the html",
    );
    expect(out).not.toMatch(/example|https|img\/|png|ghi chú ẩn|<b>/);
  });

  it("văn bản thường không bị đổi: dấu < >, snake_case, phép nhân 2 * 3 * 4", () => {
    for (const s of ["Xin chào, đây là văn bản thường.", "a < b và c > d", "biến my_var_name dùng ở đây", "tính 2 * 3 * 4 ra 24"]) {
      expect(stripMarkdown(s)).toBe(s);
    }
  });

  it("extractMarkdownText: ok với văn bản có cú pháp; NO_TEXT nếu chỉ toàn cú pháp; tôn trọng charsMax", () => {
    expect(extractMarkdownText({ buffer: Buffer.from("# Xin chào\n\nĐây là **bài** nộp.", "utf8"), charsMax: 1000 })).toEqual({
      ok: true,
      text: "Xin chào\n\nĐây là bài nộp.",
      truncated: false,
    });
    expect(extractMarkdownText({ buffer: Buffer.from("---\n\n```\n```\n", "utf8"), charsMax: 1000 })).toEqual({ ok: false, reason: "NO_TEXT" });
    expect(extractMarkdownText({ buffer: Buffer.from("# Xin chào các bạn", "utf8"), charsMax: 8 })).toMatchObject({ ok: true, text: "Xin chào", truncated: true });
    expect(markdownExtractor.id).toBe("markdown");
  });

  it("chú thích HTML: bỏ đủ nhiều chú thích, chú thích không đóng được giữ nguyên", () => {
    expect(normalizeText(stripMarkdown("a <!-- x --> b <!-- y\nz --> c"))).toBe("a b c");
    expect(stripMarkdown("a <!-- không đóng")).toBe("a <!-- không đóng");
    expect(normalizeText(stripMarkdown("a <!-- x --> b <!-- không đóng"))).toBe("a b khong dong");
  });

  it("đầu vào thù địch (tệp người dùng tải lên) không làm regex chạy O(n²): mỗi ca dưới 2 giây", () => {
    const hostile = [
      "\n".repeat(50_000) + "chữ",
      "![".repeat(300_000),
      "<a".repeat(300_000),
      "<!--".repeat(150_000),
      `${" ".repeat(300_000)}x`,
      "[a](".repeat(150_000),
      `${"-".repeat(300_000)}x`,
      "*a ".repeat(200_000),
      `${"1".repeat(300_000)}x`,
    ];
    for (const input of hostile) {
      const started = Date.now();
      stripMarkdown(input);
      expect(Date.now() - started).toBeLessThan(2000);
    }
  });
});

describe("assessTextQuality (PLAG-08: PDF ảnh quét → NO_TEXT)", () => {
  const sentence = "Trường Đại học Bách Khoa tổ chức hội thảo khoa học về trí tuệ nhân tạo và ứng dụng trong giáo dục đại học hiện nay. ";
  const goodText = sentence.repeat(4);

  it("văn bản đủ dài, phần lớn là chữ → ok", () => {
    const q = assessTextQuality(goodText);
    expect(q.ok).toBe(true);
    expect(q.words).toBeGreaterThanOrEqual(50);
    expect(q.validCharRatio).toBeGreaterThan(0.8);
    expect(assessTextQuality(goodText.normalize("NFD")).ok).toBe(true);
  });

  it("PDF ảnh quét (không lớp chữ) và trang chỉ khoảng trắng → TOO_FEW_WORDS", () => {
    expect(assessTextQuality("")).toEqual({ ok: false, words: 0, validCharRatio: 0, reason: "TOO_FEW_WORDS" });
    expect(assessTextQuality(" \n\n \f ").reason).toBe("TOO_FEW_WORDS");
    expect(assessTextQuality(sentence).reason).toBe("TOO_FEW_WORDS");
  });

  it("lỗi font/ký tự lạ: đủ từ nhưng tỉ lệ chữ-số hợp lệ < 60 % → LOW_VALID_CHAR_RATIO", () => {
    const garbage = `${"@#$%^&*()!~".repeat(2)} `.repeat(60);
    const q = assessTextQuality(`${goodText} ${garbage}`);
    expect(q.reason).toBe("LOW_VALID_CHAR_RATIO");
    expect(q.validCharRatio).toBeLessThan(0.6);
    expect(assessTextQuality("\u{FFFD}\u{FFFD}\u{FFFD} ".repeat(200), { minWords: 0 }).reason).toBe("LOW_VALID_CHAR_RATIO");
  });

  it("ngưỡng tuỳ chỉnh", () => {
    expect(assessTextQuality("một hai ba bốn năm", { minWords: 5 }).ok).toBe(true);
    expect(assessTextQuality("một hai ba bốn năm", { minWords: 6 }).ok).toBe(false);
    expect(assessTextQuality(goodText, { minValidCharRatio: 0.99 }).reason).toBe("LOW_VALID_CHAR_RATIO");
  });
});

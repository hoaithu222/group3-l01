import { PdfDocument } from "../services/pdf/pdf-document";
import { loadReportFonts } from "../services/pdf/pdf-fonts";
import { extractPdfLines, extractPdfText, pdfPageCount } from "./support/pdf-text";

const VIETNAMESE =
  "aàáảãạăằắẳẵặâầấẩẫậeèéẻẽẹêềếểễệiìíỉĩịoòóỏõọôồốổỗộơờớởỡợuùúủũụưừứửữựyỳýỷỹỵđ AÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬEÈÉẺẼẸÊỀẾỂỄỆIÌÍỈĨỊOÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢUÙÚỦŨỤƯỪỨỬỮỰYỲÝỶỸỴĐ";

describe("TtfFont — font nhúng đủ glyph tiếng Việt", () => {
  const { regular, semiBold } = loadReportFonts();

  it("có glyph cho MỌI chữ cái tiếng Việt (hoa/thường) và các ký hiệu báo cáo dùng; ký tự ngoài font trả .notdef (0)", () => {
    for (const font of [regular, semiBold]) {
      for (const ch of new Set([...VIETNAMESE].filter((c) => c !== " "))) expect({ ch, gid: font.glyphId(ch.codePointAt(0) as number) > 0 }).toEqual({ ch, gid: true });
      for (const ch of "·×÷–—…%/()0123456789,.:-") expect({ ch, gid: font.glyphId(ch.codePointAt(0) as number) > 0 }).toEqual({ ch, gid: true });
      expect(font.glyphId("✓".codePointAt(0) as number)).toBe(0);
      expect(font.unitsPerEm).toBe(1000);
      expect(font.numGlyphs).toBeGreaterThan(1000);
    }
  });

  it("độ rộng chuỗi tỉ lệ với cỡ chữ; chuỗi rỗng rộng 0", () => {
    const text = "Nguyễn Văn Ưu";
    expect(regular.measure(text, 20)).toBeCloseTo(regular.measure(text, 10) * 2, 5);
    expect(semiBold.measure(text, 10)).toBeGreaterThan(0);
    expect(regular.measure("", 10)).toBe(0);
  });

  it("tên PostScript đọc được từ bảng name", () => {
    expect(regular.postScriptName).toMatch(/PlusJakartaSans/);
  });
});

describe("PdfDocument — cấu trúc PDF hợp lệ + văn bản trích lại đúng", () => {
  const build = (draw: (page: ReturnType<PdfDocument["addPage"]>, index: number) => void, pages = 1) => {
    const { regular, semiBold } = loadReportFonts();
    const doc = new PdfDocument({ title: "Báo cáo đóng góp — Nguyễn", author: "Super App", creationDate: new Date("2026-09-15T03:00:00Z") }, { F1: regular, F2: semiBold });
    for (let i = 0; i < pages; i += 1) draw(doc.addPage(), i);
    return doc.finish();
  };

  it("bảng xref trỏ đúng từng đối tượng, startxref trỏ đúng bảng xref, trailer có Root/Info/Size", () => {
    const pdf = build((page) => page.text("Nguyễn Văn Ưu", 40, 800));
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-1.7")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    const startxref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    const offsets = [...text.slice(startxref).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    offsets.forEach((offset, i) => expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    expect(text).toMatch(/\/Size \d+ \/Root 1 0 R \/Info \d+ 0 R/);
    expect(text).toContain("/Type /Catalog");
    expect(pdfPageCount(pdf)).toBe(1);
  });

  it("trích lại đúng toàn bộ bảng chữ cái tiếng Việt qua ToUnicode (không mất/đổi dấu) và giữ hai font riêng", () => {
    const pdf = build((page) => {
      page.text(VIETNAMESE, 40, 780, { font: "F1", size: 9 });
      page.text("Nguyễn Văn Ưu — Đặng Thị Hoài Thu", 40, 760, { font: "F2", size: 12 });
      page.text("Trang 1/1", 555, 20, { font: "F1", size: 8, align: "right" });
    });
    const lines = extractPdfLines(pdf);
    expect(lines).toContain(VIETNAMESE);
    expect(lines).toContain("Nguyễn Văn Ưu — Đặng Thị Hoài Thu");
    expect(lines).toContain("Trang 1/1");
  });

  it("chuỗi rỗng không tạo lệnh vẽ; NFD được chuẩn hoá về NFC (dấu tách rời vẫn ra đúng chữ)", () => {
    const decomposed = "Nguyễn Văn Ưu"; // ê + dấu ngã, ă, ư ở dạng tổ hợp
    const pdf = build((page) => {
      page.text("", 40, 700);
      page.text(decomposed, 40, 680);
    });
    expect(extractPdfText(pdf)).toBe("Nguyễn Văn Ưu");
  });

  it("nhiều trang: Count đúng và mỗi trang có nội dung riêng", () => {
    const pdf = build((page, i) => page.text(`Trang nội dung ${i + 1}`, 40, 700), 3);
    expect(pdfPageCount(pdf)).toBe(3);
    expect(extractPdfLines(pdf)).toEqual(["Trang nội dung 1", "Trang nội dung 2", "Trang nội dung 3"]);
  });

  it("căn phải/giữa dùng độ rộng thật của chữ; hình chữ nhật và đường kẻ không làm hỏng luồng nội dung", () => {
    const pdf = build((page) => {
      page.rect(40, 700, 100, 20, { fill: [241, 243, 245], stroke: [206, 212, 218] });
      page.line(40, 690, 140, 690, { stroke: [0, 0, 0], lineWidth: 1 });
      page.text("phải", 140, 705, { align: "right" });
      page.text("giữa", 90, 680, { align: "center" });
    });
    expect(extractPdfLines(pdf).sort()).toEqual(["giữa", "phải"]);
  });

  it("cần ít nhất một font", () => {
    expect(() => new PdfDocument({ title: "x" }, {})).toThrow("Cần ít nhất một font");
  });
});

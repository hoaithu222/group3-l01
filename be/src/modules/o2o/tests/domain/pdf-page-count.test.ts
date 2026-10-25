import { deflateSync } from "zlib";
import { countPdfPages } from "../../domain/pdf-page-count";
import { makePdf } from "../o2o-test-kit";

/** PDF 1.5 kiểu Word/LibreOffice: cây trang nằm trong object stream nén Flate (không có `/Type /Pages` ở dạng thô). */
function makeCompressedPdf(pages: number): Buffer {
  const kids = Array.from({ length: pages }, (_, i) => `${i + 10} 0 R`).join(" ");
  const inner = `<< /Type /Catalog /Pages 2 0 R >> << /Type /Pages /Kids [${kids}] /Count ${pages} >> ${Array.from({ length: pages }, () => "<< /Type /Page /Parent 2 0 R >>").join(" ")}`;
  const data = deflateSync(Buffer.from(inner, "latin1"));
  const head = Buffer.from(`%PDF-1.5\n5 0 obj << /Type /ObjStm /N ${pages + 2} /First 20 /Filter /FlateDecode /Length ${data.length} >>\nstream\n`, "latin1");
  const tail = Buffer.from("\nendstream\nendobj\n6 0 obj << /Type /Outlines /Count 3 >> endobj\n%%EOF", "latin1");
  return Buffer.concat([head, data, tail]);
}

describe("pdf-page-count (không thư viện — README §2 Đếm trang)", () => {
  it("PDF thường: lấy /Count của nút gốc /Type /Pages", () => {
    expect(countPdfPages(makePdf(12))).toEqual({ ok: true, pages: 12 });
    expect(countPdfPages(makePdf(1))).toEqual({ ok: true, pages: 1 });
  });

  it("PDF 1.5 nén object stream: giải nén rồi đếm; bỏ qua /Count của Outlines", () => {
    expect(countPdfPages(makeCompressedPdf(37))).toEqual({ ok: true, pages: 37 });
  });

  it("cây trang lồng nhiều cấp: nút gốc có /Count lớn nhất", () => {
    const pdf = Buffer.from(
      "%PDF-1.4\n2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R] /Count 7 >> endobj\n3 0 obj << /Type /Pages /Parent 2 0 R /Count 4 >> endobj\n4 0 obj << /Type /Pages /Parent 2 0 R /Count 3 >> endobj\n%%EOF",
      "latin1"
    );
    expect(countPdfPages(pdf)).toEqual({ ok: true, pages: 7 });
  });

  it("không có cây trang → đếm lá /Type /Page", () => {
    const pdf = Buffer.from("%PDF-1.4\n3 0 obj << /Type /Page >> endobj\n4 0 obj << /Type /Page >> endobj\n%%EOF", "latin1");
    expect(countPdfPages(pdf)).toEqual({ ok: true, pages: 2 });
  });

  it("không phải PDF → NOT_PDF (O2O_003); PDF không đọc được trang → UNREADABLE", () => {
    expect(countPdfPages(Buffer.from("PK\u0003\u0004 docx", "latin1"))).toEqual({ ok: false, reason: "NOT_PDF" });
    expect(countPdfPages(Buffer.from("%PDF-1.4\n%%EOF", "latin1"))).toEqual({ ok: false, reason: "UNREADABLE" });
  });
});

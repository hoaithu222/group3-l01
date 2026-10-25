import * as Y from "yjs";
import { DOCUMENT_FRAGMENT } from "../../../shared/collab";
import { extractPlainText, truncateUtf8 } from "../services/yjs-text";

function el(name: string, ...children: Array<Y.XmlElement | Y.XmlText>): Y.XmlElement {
  const e = new Y.XmlElement(name);
  e.insert(0, children);
  return e;
}
function text(value: string, attrs?: Record<string, unknown>): Y.XmlText {
  const t = new Y.XmlText();
  t.insert(0, value, attrs);
  return t;
}
function stateOf(...blocks: Array<Y.XmlElement>): Uint8Array {
  const doc = new Y.Doc();
  doc.getXmlFragment(DOCUMENT_FRAGMENT).push(blocks);
  return Y.encodeStateAsUpdate(doc);
}

describe("extractPlainText (be.md §10: heading, list, bảng, emoji tiếng Việt)", () => {
  it("tiêu đề + đoạn + danh sách + trích dẫn: mỗi khối một dòng, chữ đậm/nghiêng giữ nguyên chữ", () => {
    const state = stateOf(
      el("heading", text("Báo cáo tuần")),
      el("paragraph", text("Nội dung "), text("quan trọng", { bold: true })),
      el("bulletList", el("listItem", el("paragraph", text("việc một"))), el("listItem", el("paragraph", text("việc hai")))),
      el("blockquote", el("paragraph", text("trích dẫn")))
    );
    const out = extractPlainText(state, 100_000);
    expect(out.text).toBe("Báo cáo tuần\nNội dung quan trọng\nviệc một\nviệc hai\ntrích dẫn");
    expect(out.wordCount).toBe(13);
  });

  it("bảng: ô cách nhau bằng khoảng trắng, hàng xuống dòng; ngắt dòng cứng (hardBreak) thành \\n", () => {
    const state = stateOf(
      el("table", el("tableRow", el("tableHeader", el("paragraph", text("Tên"))), el("tableHeader", el("paragraph", text("Điểm")))), el("tableRow", el("tableCell", el("paragraph", text("An"))), el("tableCell", el("paragraph", text("9"))))),
      el("paragraph", text("dòng 1"), el("hardBreak"), text("dòng 2"))
    );
    const out = extractPlainText(state, 100_000);
    expect(out.text).toContain("Tên Điểm");
    expect(out.text).toContain("An 9");
    expect(out.text).toContain("dòng 1\ndòng 2");
  });

  it("emoji + tiếng Việt: giữ nguyên ở plainText, normalizedText bỏ dấu (tìm kiếm không dấu)", () => {
    const out = extractPlainText(stateOf(el("paragraph", text("Đại học Bách Khoa 🎓 Hà Nội 👨‍👩‍👧"))), 100_000);
    expect(out.text).toBe("Đại học Bách Khoa 🎓 Hà Nội 👨‍👩‍👧");
    expect(out.normalizedText).toContain("dai hoc bach khoa");
    expect(out.normalizedText).toContain("ha noi");
    expect(out.wordCount).toBe(8);
  });

  it("nút ảnh không sinh chữ (chỉ giữ assetId trong state); đoạn rỗng không đẻ dòng trống thừa", () => {
    const img = el("image");
    img.setAttribute("assetId", "66f1a2b3c4d5e6f708192a3d");
    const out = extractPlainText(stateOf(el("paragraph", text("a")), el("paragraph"), el("paragraph"), el("paragraph"), img, el("paragraph", text("b"))), 100_000);
    expect(out.text).toBe("a\nb");
  });

  it("state rỗng/null → chuỗi rỗng, 0 từ", () => {
    for (const s of [null, undefined, new Uint8Array()]) expect(extractPlainText(s, 1000)).toEqual({ text: "", normalizedText: "", wordCount: 0 });
  });

  it("cắt theo BYTE UTF-8 (trần 100 KB): không chẻ đôi ký tự/emoji", () => {
    const long = "Đ".repeat(60_000); // 2 byte/ký tự = 120 KB
    const out = extractPlainText(stateOf(el("paragraph", text(long))), 100_000);
    expect(Buffer.byteLength(out.text, "utf8")).toBeLessThanOrEqual(100_000);
    expect(out.text.length).toBeGreaterThan(49_000);
    const cut = truncateUtf8("a🎓b", 4); // 🎓 = 4 byte, cần ≥ 5 byte để giữ cả 'a' + emoji
    expect(cut).toBe("a");
    expect(truncateUtf8("xin chào", 100)).toBe("xin chào");
  });
});

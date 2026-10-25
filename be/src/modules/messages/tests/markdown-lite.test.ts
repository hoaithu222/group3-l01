/**
 * Unit — `services/markdown-lite.ts` (be.md §5.8/§10). Không cần Prisma/Redis
 * thật — hàm thuần `normalize()`/`extractLinks()`.
 *
 * be.md §5.8 + README §2 "Định dạng": server lưu nội dung NGUYÊN VĂN, KHÔNG
 * parse sang HTML/sanitize `<script>`/`javascript:`/`data:` — chỉ CHUẨN HOÁ
 * (NFC, ký tự điều khiển, zero-width, dòng trống) + trích `links[]` giới hạn
 * đúng scheme `http(s)://`/`www.`. Test dưới đây xác nhận ĐÚNG hành vi thật
 * của code (không giả định có sanitize XSS phía server — việc đó để client
 * render whitelist, be.md §5.8 "client render whitelist").
 */
import { normalize, extractLinks } from "../services/markdown-lite";
import { graphemeLength } from "../../../core/utils/normalize";

describe("markdown-lite#normalize()", () => {
  it("NFC hoá chuỗi tổ hợp dấu (decomposed → precomposed)", () => {
    const decomposed = "é"; // "e" + combining acute accent
    expect(normalize(decomposed)).toBe("é"); // "é" precomposed
  });

  it("xoá ký tự điều khiển C0 ngoài \\n và \\t", () => {
    const input = "a\x07b\x1bc\td\ne";
    expect(normalize(input)).toBe("abc\td\ne");
  });

  it("xoá ký tự điều khiển C0 ở đầu/cuối chuỗi (null byte)", () => {
    expect(normalize("\x00Chào\x00")).toBe("Chào");
  });

  it("gộp chuỗi zero-width lặp > 10 lần về 1 ký tự", () => {
    const run = "​".repeat(11); // ZWSP x11 → collapse
    expect(normalize(`a${run}b`)).toBe("a​b");
  });

  it("KHÔNG đụng vào chuỗi zero-width đúng 10 lần (chưa vượt ngưỡng)", () => {
    const run = "​".repeat(10);
    expect(normalize(`a${run}b`)).toBe(`a${run}b`);
  });

  it("gộp > 3 dòng trống liên tiếp (≥5 dấu xuống dòng) về đúng 3 dòng trống", () => {
    const input = "Dòng 1" + "\n".repeat(6) + "Dòng 2"; // 5 dòng trống ở giữa
    expect(normalize(input)).toBe("Dòng 1" + "\n".repeat(4) + "Dòng 2");
  });

  it("giữ nguyên đúng 3 dòng trống (4 dấu xuống dòng, chưa vượt ngưỡng)", () => {
    const input = "Dòng 1" + "\n".repeat(4) + "Dòng 2";
    expect(normalize(input)).toBe(input);
  });

  it("xoá khoảng trắng/tab cuối mỗi dòng + trim toàn chuỗi", () => {
    const input = "Hello   \nWorld\t \n\n\n";
    expect(normalize(input)).toBe("Hello\nWorld");
  });

  it("KHÔNG strip/escape <script>/javascript:/data: — lưu nguyên văn (server không sanitize HTML, be.md §5.8)", () => {
    expect(normalize("<script>alert(1)</script>")).toBe("<script>alert(1)</script>");
    expect(normalize("Bấm vào javascript:alert(1) để xem")).toBe("Bấm vào javascript:alert(1) để xem");
    expect(normalize("data:text/html;base64,PHNjcmlwdD4=")).toBe("data:text/html;base64,PHNjcmlwdD4=");
  });

  it("grapheme-aware: emoji ghép ZWJ (gia đình) sau normalize() vẫn đếm đúng 1 grapheme/lần lặp", () => {
    const family = "👨‍👩‍👧‍👦"; // 7 code point (ZWJ) nhưng 1 grapheme hiển thị
    const content = normalize(family.repeat(50));
    expect(graphemeLength(content)).toBe(50);
    // Không bị coi là "zero-width lặp > 10" dù có 3 ZWJ (‍) liên tiếp trong MỖI emoji
    // (không liên tiếp NHAU giữa các emoji vì có code point pictographic xen giữa).
    expect(content.length).toBeGreaterThan(0);
  });
});

describe("markdown-lite#extractLinks()", () => {
  it("trích link http(s)://", () => {
    expect(extractLinks("Xem tại https://example.com/path?a=1 nhé")).toEqual([
      { url: "https://example.com/path?a=1", host: "example.com" },
    ]);
  });

  it("trích link www. (không scheme) — host suy ra qua http:// giả định", () => {
    expect(extractLinks("Ghé www.example.com xem thử")).toEqual([{ url: "www.example.com", host: "www.example.com" }]);
  });

  it("KHÔNG trích javascript: (bỏ qua scheme khác http/https/www)", () => {
    expect(extractLinks("Bấm vào javascript:alert(1) để xem")).toEqual([]);
  });

  it("KHÔNG trích data: URI", () => {
    expect(extractLinks("data:text/html;base64,PHNjcmlwdD4=")).toEqual([]);
  });

  it("cắt dấu câu dính liền cuối URL khi gõ trong câu (không có khoảng trắng ngăn cách)", () => {
    expect(extractLinks("Xem tại https://a.com/x. Cảm ơn")).toEqual([{ url: "https://a.com/x", host: "a.com" }]);
    expect(extractLinks("Xem tại https://a.com/x, nhé")).toEqual([{ url: "https://a.com/x", host: "a.com" }]);
  });

  it("giới hạn tối đa linksMax=10 link/tin", () => {
    const urls = Array.from({ length: 15 }, (_, i) => `https://example${i}.com`);
    const links = extractLinks(urls.join(" "));
    expect(links).toHaveLength(10);
    expect(links[0].url).toBe("https://example0.com");
    expect(links[9].url).toBe("https://example9.com");
  });

  it("khử trùng lặp không phân biệt hoa/thường, giữ RAW url của lần xuất hiện đầu (host luôn lowercase — WHATWG URL)", () => {
    const links = extractLinks("https://A.com và lại https://a.com nữa");
    expect(links).toEqual([{ url: "https://A.com", host: "a.com" }]);
  });

  it("nội dung không có link → mảng rỗng", () => {
    expect(extractLinks("Không có link nào ở đây cả")).toEqual([]);
  });
});

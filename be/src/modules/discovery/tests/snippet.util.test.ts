/**
 * Unit — `services/snippet.util.ts` (be.md p1-09 §5.4/§10): map vị trí chuẩn hoá ↔ bản gốc,
 * highlight, đ/Đ, dấu tổ hợp NFD, emoji, marker mention, cắt cửa sổ.
 * `highlights` tính theo UTF-16 code unit của `snippet`.
 */
import { normalizeSearch } from "../../../core/utils/normalize";
import { buildDisplayText, buildExcerpt, buildSnippet } from "../services/snippet.util";

/** Các đoạn snippet được highlight (để so sánh dễ đọc thay vì đếm offset tay). */
function highlighted(content: string, terms: string[], max = 160, mentions: Parameters<typeof buildSnippet>[1] = []) {
  const { snippet, highlights } = buildSnippet(content, mentions, terms, max);
  return { snippet, parts: highlights.map((h) => snippet.slice(h.start, h.end)), highlights };
}

describe("buildSnippet() — wordStart (p5-04)", () => {
  const parts = (content: string, terms: string[], wordStart: boolean) => {
    const { snippet, highlights } = buildSnippet(content, [], terms, 160, { wordStart });
    return highlights.map((h) => snippet.slice(h.start, h.end));
  };

  it("wordStart chỉ tô chỗ khớp ở ĐẦU từ; mặc định vẫn tô mọi chỗ khớp (p1-09 giữ nguyên)", () => {
    expect(parts("Bản đồ An Nhiên", ["an"], true)).toEqual(["An"]);
    expect(parts("Bản đồ An Nhiên", ["an"], false)).toEqual(["ản", "An"]);
  });

  it("sau ký tự không phải chữ/số (dấu câu, gạch dưới) vẫn là đầu từ; giữa từ thì không", () => {
    expect(parts("(báo cáo) bao_cao xbao", ["bao"], true)).toEqual(["báo", "bao"]);
  });
});

describe("buildSnippet()", () => {
  it("DU-01: giữ nguyên dấu gốc, highlight đúng vị trí dù tìm không dấu", () => {
    const r = highlighted("Đồ án cuối kỳ", ["do", "an"]);
    expect(r.snippet).toBe("Đồ án cuối kỳ");
    expect(r.parts).toEqual(["Đồ", "án"]);
    expect(r.highlights).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
    ]);
  });

  it("đ/Đ ánh xạ về d, không phân biệt hoa/thường", () => {
    expect(highlighted("ĐÔNG đông Đ", ["dong"]).parts).toEqual(["ĐÔNG", "đông"]);
    expect(highlighted("đường ĐƯỜNG", ["duong"]).parts).toEqual(["đường", "ĐƯỜNG"]);
  });

  it("dấu tổ hợp NFD: highlight phủ cả cụm (base + dấu), offset theo code unit", () => {
    const nfd = "Đồ án"; // "Đồ án" ở dạng NFD (ồ = o + ^ + `, á = a + ´)
    expect(nfd.normalize("NFC")).toBe("Đồ án");
    const r = highlighted(nfd, ["do", "an"]);
    expect(r.snippet).toBe(nfd);
    expect(r.parts).toEqual(["Đồ", "án"]);
    expect(r.highlights[0]).toEqual({ start: 0, end: 4 }); // Đ(1) + o(1) + ^(1) + `(1)
  });

  it("emoji: offset là UTF-16 code unit, không lệch khi trước match có emoji ghép ZWJ", () => {
    const family = "👨‍👩‍👧"; // 1 grapheme, 8 code unit
    const content = `${family} 😀 đồ án ${family}`;
    const r = highlighted(content, ["do", "an"]);
    expect(r.parts).toEqual(["đồ", "án"]);
    const start = r.highlights[0].start;
    expect(start).toBe(`${family} 😀 `.length);
    expect(r.snippet.slice(start, start + 2)).toBe("đồ");
  });

  it("term khớp giữa từ vẫn highlight đúng phần khớp (theo grapheme)", () => {
    const r = highlighted("Lập trình viên", ["trinh"]);
    expect(r.parts).toEqual(["trình"]);
  });

  it("nhiều lần xuất hiện + term chồng lấn được gộp thành 1 highlight", () => {
    const r = highlighted("an ang an", ["an", "ang"]);
    expect(r.parts).toEqual(["an", "ang", "an"]);
    // "an" trong "ang" bị "ang" trùm — không sinh highlight chồng nhau
    for (let i = 1; i < r.highlights.length; i += 1) {
      expect(r.highlights[i].start).toBeGreaterThanOrEqual(r.highlights[i - 1].end);
    }
  });

  it("ký tự regex trong từ khoá được coi là literal", () => {
    const r = highlighted("giá (a+)+$ rẻ", ["(a+)+$"]);
    expect(r.parts).toEqual(["(a+)+$"]);
  });

  it("gộp khoảng trắng/xuống dòng trong snippet, offset vẫn khớp", () => {
    const r = highlighted("đồ\n\n  án   cuối", ["cuoi"]);
    expect(r.snippet).toBe("đồ án cuối");
    expect(r.parts).toEqual(["cuối"]);
  });

  it("nội dung dài: cắt cửa sổ quanh vị trí khớp, có … hai đầu, highlight nằm trong cửa sổ", () => {
    const filler = "lorem ipsum ".repeat(60); // 720 grapheme
    const content = `${filler}Đồ án hiếm ${filler}`;
    const r = highlighted(content, ["hiem"], 100);
    expect(r.snippet.startsWith("…")).toBe(true);
    expect(r.snippet.endsWith("…")).toBe(true);
    expect(Array.from(r.snippet).length).toBeLessThanOrEqual(102);
    expect(r.parts).toEqual(["hiếm"]);
    expect(normalizeSearch(r.parts[0])).toBe("hiem");
  });

  it("match ở đầu văn bản dài: không có … đầu; ở cuối: không có … cuối", () => {
    const filler = "lorem ipsum ".repeat(60);
    const head = highlighted(`Đồ án ${filler}`, ["do"], 100);
    expect(head.snippet.startsWith("…")).toBe(false);
    expect(head.snippet.endsWith("…")).toBe(true);
    const tail = highlighted(`${filler}đồ án`, ["an"], 100);
    expect(tail.snippet.startsWith("…")).toBe(true);
    expect(tail.snippet.endsWith("…")).toBe(false);
    expect(tail.parts).toEqual(["án"]);
  });

  it("không có term nào khớp (vd chỉ khớp qua marker) → snippet đầu văn bản, không highlight", () => {
    const r = highlighted("xin chào các bạn", ["zzz"]);
    expect(r.snippet).toBe("xin chào các bạn");
    expect(r.highlights).toEqual([]);
  });

  it("content null/rỗng → snippet rỗng", () => {
    expect(buildSnippet(null, [], ["a"])).toEqual({ snippet: "", highlights: [] });
    expect(buildSnippet("", [], ["a"])).toEqual({ snippet: "", highlights: [] });
  });

  it("marker mention được thay bằng @tên: tìm theo tên highlight đúng vị trí trên bản hiển thị", () => {
    const userId = "507f1f77bcf86cd799439011";
    const content = `Chào @{u:${userId}} nhé`;
    const mentions = [{ type: "USER", targetId: userId, label: "Nam" }];
    expect(buildDisplayText(content, mentions)).toBe("Chào @Nam nhé");
    const r = highlighted(content, ["nam"], 160, mentions);
    expect(r.snippet).toBe("Chào @Nam nhé");
    expect(r.parts).toEqual(["Nam"]);
    // id hex KHÔNG bao giờ lộ ra snippet
    expect(r.snippet).not.toContain(userId);
  });
});

describe("buildDisplayText()", () => {
  const id = "507f1f77bcf86cd799439011";

  it("USER thiếu nhãn → 'người dùng'; ALL → 'tất cả'; ROLE → mã vai trò (khớp MentionService)", () => {
    expect(buildDisplayText(`a @{u:${id}} b`, [])).toBe("a @người dùng b");
    expect(buildDisplayText("a @{all} b", [])).toBe("a @tất cả b");
    expect(buildDisplayText("a @{r:ADMIN} b", [])).toBe("a @ADMIN b");
  });

  it("marker sai định dạng giữ nguyên như văn bản thường", () => {
    expect(buildDisplayText("a @{u:xyz} @{all", [])).toBe("a @{u:xyz} @{all");
  });

  it("id khác hoa/thường vẫn khớp nhãn", () => {
    const upper = id.toUpperCase();
    expect(buildDisplayText(`@{u:${upper}}`, [{ type: "USER", targetId: id, label: "Lan" }])).toBe("@Lan");
  });
});

describe("buildExcerpt()", () => {
  const noMentions: never[] = [];

  it("nội dung chữ: gộp khoảng trắng, cắt theo grapheme + …", () => {
    expect(buildExcerpt({ content: "xin\n chào", mentions: noMentions, attachments: [] })).toBe("xin chào");
    const long = "ab ".repeat(100);
    const out = buildExcerpt({ content: long, mentions: noMentions, attachments: [] }, 20);
    expect(Array.from(out).length).toBe(21);
    expect(out.endsWith("…")).toBe(true);
  });

  it("tin chỉ có tệp → nhãn theo loại (tên tệp chỉ cho FILE)", () => {
    const ex = (kind: string) => buildExcerpt({ content: null, mentions: noMentions, attachments: [{ kind, name: "bao-cao.pdf" }] });
    expect(ex("IMAGE")).toBe("[Ảnh]");
    expect(ex("VIDEO")).toBe("[Video]");
    expect(ex("VOICE")).toBe("[Tin nhắn thoại]");
    expect(ex("AUDIO")).toBe("[Âm thanh]");
    expect(ex("FILE")).toBe("[Tệp] bao-cao.pdf");
  });

  it("không chữ, không tệp → rỗng", () => {
    expect(buildExcerpt({ content: "   ", mentions: noMentions, attachments: [] })).toBe("");
  });
});

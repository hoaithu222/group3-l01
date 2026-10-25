import {
  beforeCursor,
  computeSearchBounds,
  diacriticInsensitivePattern,
  ejsonDate,
  iterateWindows,
  matchesAllTokens,
  monthsAgo,
  oid,
  parseCursorPoint,
  tokenize,
  withWindow,
  wordStartPattern,
} from "../search-query";
import { encodeCursor, decodeOffsetCursor, encodeOffsetCursor } from "../cursor";
import { normalizeSearch } from "../normalize";

const OPTS = { min: 2, max: 100, maxTokens: 8 };

describe("tokenize", () => {
  it('"Báo cáo" ≡ "bao cao" và "Đồ án" ≡ "do an" (không dấu, không phân biệt hoa/thường)', () => {
    expect(tokenize("Báo cáo", OPTS).tokens).toEqual(["bao", "cao"]);
    expect(tokenize("bao cao", OPTS).tokens).toEqual(["bao", "cao"]);
    expect(tokenize("Đồ án", OPTS).tokens).toEqual(["do", "an"]);
    expect(tokenize("do an", OPTS).tokens).toEqual(["do", "an"]);
  });

  it("bỏ trùng, giữ thứ tự, cắt ở maxTokens", () => {
    expect(tokenize("a b a c", { ...OPTS, min: 1 }).tokens).toEqual(["a", "b", "c"]);
    const many = Array.from({ length: 12 }, (_, i) => `t${i}`).join(" ");
    expect(tokenize(many, OPTS).tokens).toHaveLength(8);
  });

  it("valid theo độ dài grapheme của q đã trim (emoji ghép = 1)", () => {
    expect(tokenize("a", OPTS).valid).toBe(false);
    expect(tokenize("  ab  ", OPTS).valid).toBe(true);
    expect(tokenize("x".repeat(101), OPTS).valid).toBe(false);
    expect(tokenize("👨‍👩‍👧‍👦", { ...OPTS, min: 1 }).length).toBe(1);
    expect(tokenize("   ", OPTS).valid).toBe(false);
  });

  it("emoji được giữ trong token", () => {
    expect(tokenize("họp 🚀", OPTS).tokens).toEqual(["hop", "🚀"]);
  });

  it("ký tự đặc biệt của regex bị escape — chỉ khớp LITERAL (chống ReDoS)", () => {
    const { regexes } = tokenize(".*(a+)+$", { ...OPTS, min: 1 });
    const re = new RegExp(regexes[0]);
    expect(re.test("abc")).toBe(false);
    expect(re.test("x .*(a+)+$ y")).toBe(true);
  });
});

describe("wordStartPattern / matchesAllTokens", () => {
  it("khớp ở ĐẦU từ, không khớp giữa từ", () => {
    expect(matchesAllTokens("bao cao tuan", ["cao"])).toBe(true);
    expect(matchesAllTokens("bao cao tuan", ["ao"])).toBe(false);
    expect(matchesAllTokens("(bao cao)", ["bao"])).toBe(true);
    expect(matchesAllTokens("bao_cao", ["cao"])).toBe(true);
  });

  it("AND giữa các từ, không phụ thuộc thứ tự", () => {
    expect(matchesAllTokens("nop bao cao cuoi ky", ["cuoi", "bao"])).toBe(true);
    expect(matchesAllTokens("nop bao cao", ["cuoi", "bao"])).toBe(false);
  });

  it("wordStartPattern dùng được như $regex (không cờ i) trên chuỗi đã chuẩn hoá", () => {
    expect(new RegExp(wordStartPattern("do")).test(normalizeSearch("Đồ án cuối kỳ"))).toBe(true);
    expect(new RegExp(wordStartPattern("an")).test(normalizeSearch("Bản đồ"))).toBe(false);
  });
});

describe("diacriticInsensitivePattern", () => {
  const re = (token: string) => new RegExp(diacriticInsensitivePattern(token), "i");

  it("khớp tên gốc có dấu (tổ hợp sẵn) từ từ khoá không dấu", () => {
    expect(re("bao cao").test("Báo cáo tuần.pdf")).toBe(true);
    expect(re("do an").test("ĐỒ ÁN.docx")).toBe(true);
    expect(re("duong").test("Đường đi.png")).toBe(true);
  });

  it("khớp tên phân rã NFD (macOS)", () => {
    expect(re("bao").test("Báo cáo".normalize("NFD"))).toBe(true);
    expect(re("do").test("Đồ án".normalize("NFD"))).toBe(true);
  });

  it("ký tự đặc biệt vẫn được escape", () => {
    expect(re("a.b").test("aXb")).toBe(false);
    expect(re("a.b").test("a.b.pdf")).toBe(true);
  });
});

describe("cửa sổ thời gian & cursor", () => {
  it("computeSearchBounds: chặn trên theo to/cursor, chặn dưới theo from hoặc fallback", () => {
    const now = new Date("2026-09-25T00:00:00.000Z");
    const cursor = { at: new Date("2026-09-20T00:00:00.000Z"), id: "a".repeat(24) };
    const withCursor = computeSearchBounds({ cursor, now });
    expect(withCursor.upper.getTime()).toBe(cursor.at.getTime() + 1);
    expect(withCursor.lower.getTime()).toBe(0);

    const fallbackLower = new Date("2025-09-25T00:00:00.000Z");
    expect(computeSearchBounds({ now, fallbackLower }).lower).toEqual(fallbackLower);
    const from = new Date("2026-01-01T00:00:00.000Z");
    expect(computeSearchBounds({ now, from, fallbackLower }).lower).toEqual(from);
  });

  it("iterateWindows: mới → cũ, phủ kín không chồng, cửa sổ đầu 7 ngày rồi nhân 8", () => {
    const upper = new Date("2026-09-25T00:00:00.000Z");
    const lower = new Date("2025-09-25T00:00:00.000Z");
    const windows = [...iterateWindows(upper, lower)];
    expect(windows[0].lt).toEqual(upper);
    expect(windows[0].lt.getTime() - windows[0].gte.getTime()).toBe(7 * 24 * 3600 * 1000);
    for (let i = 1; i < windows.length; i += 1) expect(windows[i].lt).toEqual(windows[i - 1].gte);
    expect(windows[windows.length - 1].gte).toEqual(lower);
  });

  it("withWindow không bao giờ sinh $and rỗng (Mongo từ chối) và thêm điều kiện cursor khi có", () => {
    const window = { gte: new Date(0), lt: new Date(1000) };
    expect(withWindow({ kind: "USER" }, window)).not.toHaveProperty("$and");
    const cursor = { at: new Date(500), id: "b".repeat(24) };
    const filter = withWindow({ $and: [{ x: 1 }] }, window, cursor);
    expect(filter.$and).toEqual([{ x: 1 }, beforeCursor(cursor)]);
    expect(filter.createdAt).toEqual({ $gte: ejsonDate(window.gte), $lt: ejsonDate(window.lt) });
    expect(beforeCursor(cursor, "startAt")).toEqual({
      $or: [{ startAt: { $lt: ejsonDate(cursor.at) } }, { startAt: ejsonDate(cursor.at), _id: { $lt: oid(cursor.id) } }],
    });
  });

  it("monthsAgo kẹp ngày cuối tháng", () => {
    expect(monthsAgo(new Date("2026-03-31T00:00:00.000Z"), 1).toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(monthsAgo(new Date("2026-09-25T00:00:00.000Z"), 12).toISOString()).toBe("2025-09-25T00:00:00.000Z");
  });

  it("parseCursorPoint: vắng → undefined; hỏng hoặc id không phải ObjectId → 400", () => {
    expect(parseCursorPoint(undefined)).toBeUndefined();
    const good = encodeCursor(new Date("2026-09-01T00:00:00.000Z"), "c".repeat(24));
    expect(parseCursorPoint(good)?.id).toBe("c".repeat(24));
    expect(() => parseCursorPoint("###")).toThrow("Cursor không hợp lệ");
    expect(() => parseCursorPoint(encodeCursor(new Date(), "not-an-object-id"))).toThrow("Cursor không hợp lệ");
  });

  it("cursor chỉ số: vòng mã hoá/giải mã, giá trị hỏng → 0", () => {
    expect(decodeOffsetCursor(encodeOffsetCursor(60))).toBe(60);
    expect(decodeOffsetCursor(undefined)).toBe(0);
    expect(decodeOffsetCursor("bad")).toBe(0);
  });
});

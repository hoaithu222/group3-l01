/**
 * Unit — `services/search-query.builder.ts` (be.md p1-09 §10): tách từ, escape, bộ lọc,
 * cửa sổ thời gian, cursor. Hàm thuần — không cần Mongo/Prisma.
 */
import { ErrorCode } from "../../../core/utils/error.codes";
import { encodeCursor } from "../../../core/utils/cursor";
import { LIMITS } from "../../../core/constants/limits";
import { parseCursorParam } from "../services/cursor-param";
import {
  buildBaseFilter,
  computeSearchBounds,
  iterateWindows,
  oid,
  parseSearchTerms,
  withWindow,
} from "../services/search-query.builder";

const SCOPE_ID = "507f1f77bcf86cd799439011";
const AUTHOR_ID = "507f1f77bcf86cd799439012";

describe("parseSearchTerms()", () => {
  it("chuẩn hoá không dấu, chữ thường: 'Đồ Án' ≡ 'do an' (DU-01)", () => {
    expect(parseSearchTerms("Đồ Án")).toEqual(["do", "an"]);
    expect(parseSearchTerms("do an")).toEqual(["do", "an"]);
  });

  it("bỏ từ trùng, giữ thứ tự xuất hiện đầu tiên", () => {
    expect(parseSearchTerms("Đồ án đồ ÁN cuối")).toEqual(["do", "an", "cuoi"]);
  });

  it("gộp khoảng trắng thừa và trim", () => {
    expect(parseSearchTerms("  do   \t an  ")).toEqual(["do", "an"]);
  });

  it("1 grapheme hoặc rỗng → SRCH_001", () => {
    for (const q of ["", "   ", "a", " a "]) {
      expect(() => parseSearchTerms(q)).toThrow(expect.objectContaining({ statusCode: 400, errorCode: ErrorCode.SRCH_001 }));
    }
  });

  it("đúng 2 grapheme hợp lệ; emoji ghép ZWJ đếm là 1 grapheme", () => {
    expect(parseSearchTerms("ab")).toEqual(["ab"]);
    expect(() => parseSearchTerms("👨‍👩‍👧")).toThrow(expect.objectContaining({ errorCode: ErrorCode.SRCH_001 }));
    expect(() => parseSearchTerms("👨‍👩‍👧👨‍👩‍👧")).not.toThrow();
  });

  it("> 100 grapheme → SRCH_001", () => {
    expect(() => parseSearchTerms("a".repeat(LIMITS.search.queryMax + 1))).toThrow(
      expect.objectContaining({ errorCode: ErrorCode.SRCH_001 })
    );
    expect(() => parseSearchTerms("a".repeat(LIMITS.search.queryMax))).not.toThrow();
  });

  it("chỉ gồm dấu tổ hợp (chuẩn hoá rỗng) → SRCH_001", () => {
    expect(() => parseSearchTerms("́̀")).toThrow(expect.objectContaining({ errorCode: ErrorCode.SRCH_001 }));
  });

  it("quá LIMITS.search.maxTerms từ khác nhau → SRCH_002", () => {
    const nine = Array.from({ length: LIMITS.search.maxTerms + 1 }, (_, i) => `t${i}`).join(" ");
    expect(() => parseSearchTerms(nine)).toThrow(expect.objectContaining({ statusCode: 400, errorCode: ErrorCode.SRCH_002 }));
    // từ trùng KHÔNG tính vào giới hạn
    const repeated = Array.from({ length: 20 }, () => "ab").join(" ");
    expect(parseSearchTerms(repeated)).toEqual(["ab"]);
  });

  it("giữ nguyên ký tự regex trong từ — escape là việc của buildBaseFilter (SAV-04)", () => {
    expect(parseSearchTerms(".*(a+)+$")).toEqual([".*(a+)+$"]);
  });
});

describe("buildBaseFilter()", () => {
  const base = { scopeType: "CHANNEL", scopeId: SCOPE_ID, terms: ["do", "an"], includeThreads: true, floorSeq: 0 } as const;

  it("luôn kèm scope, kind ∈ {USER, POLL} (khảo sát tìm được như tin thường), deletedAt null, mỗi từ 1 regex trong $and", () => {
    const f = buildBaseFilter(base);
    expect(f).toMatchObject({ scopeType: "CHANNEL", scopeId: oid(SCOPE_ID), kind: { $in: ["USER", "POLL"] }, deletedAt: null });
    expect(f.$and).toEqual([{ normalizedContent: { $regex: "do" } }, { normalizedContent: { $regex: "an" } }]);
    expect(f.authorId).toBeUndefined();
    expect(f.threadId).toBeUndefined();
    expect(f.seq).toBeUndefined();
  });

  it("SAV-04: chuỗi ReDoS được escape thành regex literal, không còn toán tử", () => {
    const f = buildBaseFilter({ ...base, terms: [".*(a+)+$"] });
    const regex = (f.$and as { normalizedContent: { $regex: string } }[])[0].normalizedContent.$regex;
    expect(regex).toBe("\\.\\*\\(a\\+\\)\\+\\$");
    expect(new RegExp(regex).test("xx.*(a+)+$yy")).toBe(true);
    expect(new RegExp(regex).test("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!")).toBe(false);
  });

  it("bộ lọc người gửi / có tệp / loại tệp / bỏ thread / mốc ẩn hội thoại", () => {
    const f = buildBaseFilter({
      ...base,
      scopeType: "CONVERSATION",
      authorId: AUTHOR_ID,
      hasFile: true,
      fileKind: "IMAGE",
      includeThreads: false,
      floorSeq: 7,
    });
    expect(f.authorId).toEqual(oid(AUTHOR_ID));
    expect(f["attachments.0"]).toEqual({ $exists: true });
    expect(f["attachments.kind"]).toBe("IMAGE");
    expect(f.threadId).toBeNull();
    expect(f.seq).toEqual({ $gt: 7 });
  });

  it("hasFile=false hoặc vắng → không lọc (chỉ true mới lọc)", () => {
    expect(buildBaseFilter({ ...base, hasFile: false })["attachments.0"]).toBeUndefined();
  });
});

describe("withWindow() / computeSearchBounds() / iterateWindows()", () => {
  const filter = buildBaseFilter({ scopeType: "CHANNEL", scopeId: SCOPE_ID, terms: ["do"], includeThreads: true, floorSeq: 0 });

  it("withWindow ghép [gte, lt) và không đụng vào filter nền", () => {
    const w = { gte: new Date("2026-01-01T00:00:00.000Z"), lt: new Date("2026-01-08T00:00:00.000Z") };
    const out = withWindow(filter, w);
    expect(out.createdAt).toEqual({ $gte: { $date: "2026-01-01T00:00:00.000Z" }, $lt: { $date: "2026-01-08T00:00:00.000Z" } });
    expect(out.$and).toEqual(filter.$and);
    expect(filter.createdAt).toBeUndefined();
  });

  it("withWindow thêm điều kiện tie-break (createdAt, _id) khi có cursor", () => {
    const at = new Date("2026-01-05T10:00:00.000Z");
    const id = "507f1f77bcf86cd799439099";
    const out = withWindow(filter, { gte: new Date(0), lt: new Date(Date.now()) }, { at, id });
    const and = out.$and as unknown[];
    expect(and).toHaveLength((filter.$and as unknown[]).length + 1);
    expect(and[and.length - 1]).toEqual({
      $or: [
        { createdAt: { $lt: { $date: at.toISOString() } } },
        { createdAt: { $date: at.toISOString() }, _id: { $lt: oid(id) } },
      ],
    });
  });

  it("computeSearchBounds: upper = min(now+lệch, to+1ms, cursor.at+1ms); lower = from ?? epoch", () => {
    const now = new Date("2026-09-19T00:00:00.000Z");
    const noBound = computeSearchBounds({ now });
    expect(noBound.upper.getTime()).toBeGreaterThan(now.getTime());
    expect(noBound.lower.getTime()).toBe(0);

    const to = new Date("2026-09-10T00:00:00.000Z");
    const from = new Date("2026-09-01T00:00:00.000Z");
    const cursor = { at: new Date("2026-09-05T00:00:00.000Z"), id: "507f1f77bcf86cd799439099" };
    expect(computeSearchBounds({ now, to, from }).upper.getTime()).toBe(to.getTime() + 1);
    expect(computeSearchBounds({ now, to, from }).lower).toEqual(from);
    expect(computeSearchBounds({ now, to, cursor }).upper.getTime()).toBe(cursor.at.getTime() + 1);
  });

  it("iterateWindows: liên tiếp mới → cũ, không hở/chồng, cửa sổ lớn dần, dừng đúng ở lower", () => {
    const upper = new Date("2026-09-19T00:00:00.000Z");
    const lower = new Date("2024-01-01T00:00:00.000Z");
    const windows = Array.from(iterateWindows(upper, lower));
    expect(windows.length).toBeGreaterThan(1);
    expect(windows.length).toBeLessThanOrEqual(6);
    expect(windows[0].lt).toEqual(upper);
    expect(windows[windows.length - 1].gte).toEqual(lower);
    for (let i = 1; i < windows.length; i += 1) {
      expect(windows[i].lt).toEqual(windows[i - 1].gte);
      const prev = windows[i - 1].lt.getTime() - windows[i - 1].gte.getTime();
      const cur = windows[i].lt.getTime() - windows[i].gte.getTime();
      expect(cur).toBeGreaterThanOrEqual(prev);
    }
  });

  it("iterateWindows: upper <= lower → không cửa sổ nào", () => {
    const t = new Date("2026-01-01T00:00:00.000Z");
    expect(Array.from(iterateWindows(t, t))).toEqual([]);
    expect(Array.from(iterateWindows(new Date(0), t))).toEqual([]);
  });

  it("iterateWindows phủ được tới epoch chỉ với vài cửa sổ", () => {
    const windows = Array.from(iterateWindows(new Date("2026-09-19T00:00:00.000Z"), new Date(0)));
    expect(windows.length).toBeLessThanOrEqual(6);
    expect(windows[windows.length - 1].gte.getTime()).toBe(0);
  });
});

describe("parseCursorParam()", () => {
  it("vắng/rỗng → undefined; cursor hợp lệ giải mã đúng", () => {
    expect(parseCursorParam(undefined)).toBeUndefined();
    expect(parseCursorParam("")).toBeUndefined();
    const at = new Date("2026-09-19T01:02:03.004Z");
    const id = "507f1f77bcf86cd799439099";
    expect(parseCursorParam(encodeCursor(at, id))).toEqual({ at, id });
  });

  it("cursor hỏng hoặc id không phải ObjectId → 400 VAL_001 (không lọt xuống truy vấn)", () => {
    for (const bad of ["@@@", encodeCursor(new Date(), "khong-phai-objectid"), Buffer.from("2026-01-01T00:00:00.000Z").toString("base64url")]) {
      expect(() => parseCursorParam(bad)).toThrow(expect.objectContaining({ statusCode: 400, errorCode: ErrorCode.VAL_001 }));
    }
  });
});

import { hashSeedForAlgo, kgramHashes } from "../lib/fingerprint/kgram";
import { winnow } from "../lib/fingerprint/winnow";
import { buildSections, limitSections, mergeMatches, pairPostings, type PositionMatch } from "../lib/match/section-merger";
import { buildLineStarts, lineNumberAt, toSpanRange } from "../lib/match/span-range";
import { tokenizeText } from "../lib/normalize/text-normalizer";
import type { Posting } from "../lib/types";

const K = 5;
const p = (hash: number, pos: number): Posting => ({ hash, pos });
/** Chuỗi cặp khớp cách đều `step` token: (t0 + i·step, s0 + i·step), hash = base + i. */
const chain = (t0: number, s0: number, count: number, step = 4, base = 0): PositionMatch[] =>
  Array.from({ length: count }, (_, i) => ({ hash: base + i, targetPos: t0 + i * step, sourcePos: s0 + i * step }));
const postingsAt = (positions: number[], base = 0): Posting[] => positions.map((pos, i) => p(base + i, pos));

/** PRNG có seed (mulberry32) — dữ liệu ngẫu nhiên nhưng tái lập tuyệt đối. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randomTokens = (rand: () => number, n: number): string[] => Array.from({ length: n }, () => `w${Math.floor(rand() * 1e6)}`);

describe("pairPostings", () => {
  it("ghép fingerprint cùng hash, sắp theo vị trí đích", () => {
    const target = [p(1, 0), p(2, 3), p(9, 6)];
    const source = [p(1, 5), p(2, 10)];
    expect(pairPostings(target, source)).toEqual([
      { hash: 1, targetPos: 0, sourcePos: 5 },
      { hash: 2, targetPos: 3, sourcePos: 10 },
    ]);
  });

  it("allowedHashes: hash ngoài tập (tệp mẫu/phổ biến) không được ghép", () => {
    const target = [p(1, 0), p(2, 3)];
    const source = [p(1, 5), p(2, 10)];
    expect(pairPostings(target, source, { allowedHashes: new Set([2]) })).toEqual([{ hash: 2, targetPos: 3, sourcePos: 10 }]);
    expect(pairPostings(target, source, { allowedHashes: new Set() })).toEqual([]);
  });

  it("hash lặp: ≤ trần thì ghép đủ tích chéo theo thứ tự; lặp quá trần ở MỘT trong hai phía thì bỏ hẳn", () => {
    const target = [p(7, 0), p(7, 10)];
    const source = [p(7, 5), p(7, 15)];
    expect(pairPostings(target, source, { maxOccurrencesPerHash: 2 }).map((m) => [m.targetPos, m.sourcePos])).toEqual([
      [0, 5],
      [0, 15],
      [10, 5],
      [10, 15],
    ]);
    expect(pairPostings(target, source, { maxOccurrencesPerHash: 1 })).toEqual([]);
    expect(pairPostings([p(7, 0)], [p(7, 1), p(7, 2), p(7, 3)], { maxOccurrencesPerHash: 2 })).toEqual([]);
  });

  it("trần maxPairs dừng theo thứ tự vị trí đích (tất định)", () => {
    const target = postingsAt([0, 4, 8, 12]);
    const source = postingsAt([100, 104, 108, 112]);
    expect(pairPostings(target, source, { maxPairs: 2 }).map((m) => m.targetPos)).toEqual([0, 4]);
  });

  it("không khớp / rỗng → []", () => {
    expect(pairPostings([], [p(1, 1)])).toEqual([]);
    expect(pairPostings([p(1, 1)], [])).toEqual([]);
    expect(pairPostings([p(1, 1)], [p(2, 1)])).toEqual([]);
  });
});

describe("mergeMatches", () => {
  const opts = { k: K };

  it("một chuỗi liền mạch → một đoạn, nới thêm k token cuối; similarity 100 khi mọi fingerprint của đích trong đoạn đều khớp", () => {
    const matches = chain(0, 100, 5);
    const sections = mergeMatches(matches, postingsAt([0, 4, 8, 12, 16]), opts);
    expect(sections).toEqual([{ targetStart: 0, targetEnd: 21, sourceStart: 100, sourceEnd: 121, matchedHashes: 5, similarity: 100 }]);
  });

  it("nối khi cách nhau ≤ 10 token (đúng 10 vẫn nối, ngưỡng dài tối thiểu 15 được tính đủ 15)", () => {
    const sections = mergeMatches(chain(0, 100, 2, 10), postingsAt([0, 5, 10]), opts);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ targetStart: 0, targetEnd: 15, sourceStart: 100, sourceEnd: 115, similarity: 66 });
  });

  it("cách > 10 token thì TÁCH thành hai đoạn", () => {
    const matches = [...chain(0, 100, 4), ...chain(23, 123, 4, 4, 10)];
    const sections = mergeMatches(matches, postingsAt([0, 4, 8, 12, 23, 27, 31, 35]), opts);
    expect(sections.map((s) => [s.targetStart, s.targetEnd])).toEqual([
      [0, 17],
      [23, 40],
    ]);
  });

  it("PLAG-04: đảo thứ tự hàm/đoạn → nhiều đoạn, mỗi đoạn trỏ đúng vị trí nguồn (không nối chéo ngược chiều)", () => {
    const matches = [...chain(0, 200, 5), ...chain(30, 100, 5, 4, 10)];
    const sections = mergeMatches(matches, postingsAt([0, 4, 8, 12, 16, 30, 34, 38, 42, 46]), opts);
    expect(sections.map((s) => [s.targetStart, s.sourceStart])).toEqual([
      [0, 200],
      [30, 100],
    ]);
  });

  it("phải cùng chiều ở CẢ HAI phía: nguồn lùi lại thì không nối dù đích tiến sát", () => {
    const matches: PositionMatch[] = [
      { hash: 1, targetPos: 0, sourcePos: 50 },
      { hash: 2, targetPos: 4, sourcePos: 46 },
    ];
    expect(mergeMatches(matches, postingsAt([0, 4]), { ...opts, minSectionTokens: 5 })).toHaveLength(2);
  });

  it("đoạn ngắn hơn minSectionTokens bị bỏ; hạ ngưỡng thì giữ", () => {
    const one = chain(0, 100, 1);
    expect(mergeMatches(one, postingsAt([0]), opts)).toEqual([]);
    expect(mergeMatches(one, postingsAt([0]), { ...opts, minSectionTokens: 5 })).toHaveLength(1);
    // Ngưỡng áp lên phía NGẮN hơn: đích 17 token nhưng nguồn chỉ 9 (khoảng cách nguồn co lại) → bỏ.
    const skewed: PositionMatch[] = [
      { hash: 1, targetPos: 0, sourcePos: 100 },
      { hash: 2, targetPos: 4, sourcePos: 104 },
      { hash: 3, targetPos: 8, sourcePos: 105 },
    ];
    expect(mergeMatches(skewed, postingsAt([0, 4, 8]), opts)).toHaveLength(0);
  });

  it("similarity = khớp / kỳ vọng trong đoạn (fingerprint đích không có ở nguồn kéo điểm xuống)", () => {
    const sections = mergeMatches(chain(0, 100, 4), postingsAt([0, 2, 4, 6, 8, 10, 12]), opts);
    expect(sections[0].similarity).toBe(57);
    expect(sections[0].matchedHashes).toBe(4);
  });

  it("cùng một vị trí đích với hai vị trí nguồn → hai chuỗi riêng; ưu tiên nối vào chuỗi GẦN nhất", () => {
    const matches: PositionMatch[] = [
      { hash: 1, targetPos: 0, sourcePos: 100 },
      { hash: 1, targetPos: 0, sourcePos: 104 },
      { hash: 2, targetPos: 4, sourcePos: 106 },
    ];
    const sections = mergeMatches(matches, postingsAt([0, 4]), { ...opts, minSectionTokens: 5 });
    expect(sections).toEqual([
      { targetStart: 0, targetEnd: 5, sourceStart: 100, sourceEnd: 105, matchedHashes: 1, similarity: 100 },
      { targetStart: 0, targetEnd: 9, sourceStart: 104, sourceEnd: 111, matchedHashes: 2, similarity: 100 },
    ]);
  });

  it("trần sectionsMax giữ các đoạn DÀI nhất, trả về theo vị trí đích", () => {
    const matches = [...chain(0, 100, 4), ...chain(100, 300, 8, 4, 10), ...chain(200, 500, 6, 4, 20)];
    const posts = postingsAt([0, 4, 8, 12, 100, 104, 108, 112, 116, 120, 124, 128, 200, 204, 208, 212, 216, 220]);
    const sections = mergeMatches(matches, posts, { ...opts, sectionsMax: 2 });
    expect(sections.map((s) => s.targetStart)).toEqual([100, 200]);
  });

  it("không cặp nào → []", () => {
    expect(mergeMatches([], [], opts)).toEqual([]);
  });
});

describe("limitSections", () => {
  const s = (targetStart: number, len: number) => ({ targetStart, targetEnd: targetStart + len, sourceStart: 0, sourceEnd: len, matchedHashes: 1, similarity: 100 });

  it("dưới trần: giữ hết, sắp theo vị trí đích", () => {
    expect(limitSections([s(50, 10), s(0, 20)], 5).map((x) => x.targetStart)).toEqual([0, 50]);
  });

  it("vượt trần: bỏ đoạn ngắn nhất; hoà độ dài thì giữ đoạn đứng trước", () => {
    expect(limitSections([s(0, 10), s(20, 30), s(60, 30), s(100, 50)], 2).map((x) => x.targetStart)).toEqual([20, 100]);
    expect(limitSections([s(0, 10), s(20, 10), s(40, 10)], 2).map((x) => x.targetStart)).toEqual([0, 20]);
  });
});

describe("buildSections (k-gram + winnowing thật)", () => {
  const seed = hashSeedForAlgo(1);
  const fingerprints = (tokens: string[]): Posting[] => winnow(kgramHashes(tokens, K, seed), 4);

  it("đoạn 40 token chung nằm lọt trong hai tài liệu khác nhau → đúng MỘT đoạn nằm trong vùng chung, cùng đường chéo", () => {
    const rand = prng(11);
    const shared = randomTokens(rand, 40);
    const target = [...randomTokens(rand, 10), ...shared, ...randomTokens(rand, 10)];
    const source = [...randomTokens(rand, 30), ...shared, ...randomTokens(rand, 30)];
    const sections = buildSections(fingerprints(target), fingerprints(source), { k: K });
    expect(sections).toHaveLength(1);
    const [sec] = sections;
    expect(sec.targetStart).toBeGreaterThanOrEqual(10);
    expect(sec.targetEnd).toBeLessThanOrEqual(50);
    expect(sec.targetEnd - sec.targetStart).toBeGreaterThanOrEqual(24);
    expect(sec.sourceStart - sec.targetStart).toBe(20);
    expect(sec.sourceEnd - sec.targetEnd).toBe(20);
    expect(target.slice(sec.targetStart, sec.targetEnd)).toEqual(source.slice(sec.sourceStart, sec.sourceEnd));
    expect(sec.similarity).toBe(100);
  });

  it("hai đoạn chung bị đảo thứ tự ở tài liệu nguồn → hai đoạn, mỗi đoạn trỏ đúng đoạn tương ứng", () => {
    const rand = prng(23);
    const partA = randomTokens(rand, 40);
    const partB = randomTokens(rand, 40);
    const target = [...partA, ...randomTokens(rand, 25), ...partB];
    const source = [...partB, ...randomTokens(rand, 25), ...partA];
    const sections = buildSections(fingerprints(target), fingerprints(source), { k: K });
    expect(sections).toHaveLength(2);
    expect(sections[0].targetStart).toBeLessThan(40);
    expect(sections[0].sourceStart).toBeGreaterThanOrEqual(65);
    expect(sections[1].targetStart).toBeGreaterThanOrEqual(65);
    expect(sections[1].sourceStart).toBeLessThan(40);
    for (const s of sections) expect(target.slice(s.targetStart, s.targetEnd)).toEqual(source.slice(s.sourceStart, s.sourceEnd));
  });

  it("PLAG-05: loại hash của phần mẫu khỏi allowedHashes → phần mẫu không thành đoạn trùng", () => {
    const rand = prng(5);
    const template = randomTokens(rand, 40);
    const target = [...template, ...randomTokens(rand, 40)];
    const source = [...template, ...randomTokens(rand, 40)];
    const pt = fingerprints(target);
    const ps = fingerprints(source);
    expect(buildSections(pt, ps, { k: K })).toHaveLength(1);
    const ownOnly = new Set(pt.filter((x) => x.pos >= 45).map((x) => x.hash));
    expect(buildSections(pt, ps, { k: K, allowedHashes: ownOnly })).toEqual([]);
  });

  it("hai tài liệu không liên quan → không đoạn nào", () => {
    const rand = prng(99);
    expect(buildSections(fingerprints(randomTokens(rand, 200)), fingerprints(randomTokens(rand, 200)), { k: K })).toEqual([]);
  });
});

describe("buildLineStarts / lineNumberAt / toSpanRange", () => {
  const text = "ab cd\nef gh\n\nij";
  const tokens = tokenizeText(text);
  const lineStarts = buildLineStarts(text);

  it("buildLineStarts: mỗi \\n mở một dòng mới; rỗng → [0]", () => {
    expect(lineStarts).toEqual([0, 6, 12, 13]);
    expect(buildLineStarts("")).toEqual([0]);
    expect(buildLineStarts("a\n")).toEqual([0, 2]);
    expect(buildLineStarts("a\n\nb")).toEqual([0, 2, 3]);
  });

  it("lineNumberAt: tính từ 1; ký tự \\n thuộc dòng nó kết thúc; ngoài phạm vi thì kẹp", () => {
    expect(lineNumberAt(lineStarts, 0)).toBe(1);
    expect(lineNumberAt(lineStarts, 5)).toBe(1);
    expect(lineNumberAt(lineStarts, 6)).toBe(2);
    expect(lineNumberAt(lineStarts, 12)).toBe(3);
    expect(lineNumberAt(lineStarts, 14)).toBe(4);
    expect(lineNumberAt(lineStarts, -5)).toBe(1);
    expect(lineNumberAt(lineStarts, 999)).toBe(4);
  });

  it("toSpanRange: đổi token → ký tự + dòng; đoạn kết thúc ngay trước \\n vẫn thuộc dòng đó", () => {
    expect(toSpanRange(tokens, lineStarts, 1, 4)).toEqual({ startToken: 1, endToken: 4, startChar: 3, endChar: 11, lineStart: 1, lineEnd: 2 });
    expect(toSpanRange(tokens, lineStarts, 0, 2)).toMatchObject({ startChar: 0, endChar: 5, lineStart: 1, lineEnd: 1 });
    expect(toSpanRange(tokens, lineStarts, 4, 5)).toMatchObject({ startChar: 13, endChar: 15, lineStart: 4, lineEnd: 4 });
  });

  it("văn bản tiếng Việt dạng tổ hợp (NFD): ký tự/dòng vẫn theo chuỗi gốc", () => {
    const nfd = "Việt Nam\nđất nước".normalize("NFD");
    const t = tokenizeText(nfd);
    const range = toSpanRange(t, buildLineStarts(nfd), 1, 3);
    expect(nfd.slice(range.startChar, range.endChar).normalize("NFC")).toBe("Nam\nđất");
    expect([range.lineStart, range.lineEnd]).toEqual([1, 2]);
  });

  it("khoảng không hợp lệ (rỗng, ngược, âm, quá số token) → RangeError", () => {
    for (const [a, b] of [[2, 2], [3, 2], [-1, 1], [0, tokens.length + 1]] as const) {
      expect(() => toSpanRange(tokens, lineStarts, a, b)).toThrow(RangeError);
    }
  });
});

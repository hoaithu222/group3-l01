import fc from "fast-check";
import { PLAGIARISM_DEFAULTS } from "../lib/constants";
import { hashSeedForAlgo, hashTokenValues, kgramHashes } from "../lib/fingerprint/kgram";
import { murmur3Hash32 } from "../lib/fingerprint/murmur3";
import { distinctSortedHashes, winnow } from "../lib/fingerprint/winnow";
import type { Posting } from "../lib/types";

/** Bản ngây thơ O(n·w) theo đúng định nghĩa (rightmost minimum trong từng cửa sổ, ghi mỗi vị trí một lần) để đối chiếu bản O(n). */
function naiveWinnow(h: readonly number[], window: number): Posting[] {
  const n = h.length;
  if (n === 0) return [];
  const w = Math.min(window, n);
  const out: Posting[] = [];
  let last = -1;
  for (let i = 0; i + w <= n; i++) {
    let best = i;
    for (let j = i; j < i + w; j++) if (h[j] <= h[best]) best = j;
    if (best !== last) {
      out.push({ hash: h[best], pos: best });
      last = best;
    }
  }
  return out;
}

describe("winnow", () => {
  it("ví dụ kinh điển của bài báo Schleimer–Wilkerson–Aiken (w = 4)", () => {
    const h = [77, 74, 42, 17, 98, 50, 17, 98, 8, 88, 67, 39, 77, 74, 42, 17, 98];
    expect(winnow(h, 4)).toEqual([
      { hash: 17, pos: 3 },
      { hash: 17, pos: 6 },
      { hash: 8, pos: 8 },
      { hash: 39, pos: 11 },
      { hash: 17, pos: 15 },
    ]);
  });

  it("hoà thì lấy vị trí PHẢI NHẤT", () => {
    expect(winnow([5, 5, 5, 5, 5], 3)).toEqual([
      { hash: 5, pos: 2 },
      { hash: 5, pos: 3 },
      { hash: 5, pos: 4 },
    ]);
  });

  it("rỗng → []; window = 1 → mọi vị trí; số băm ít hơn window → một cửa sổ trọn tài liệu", () => {
    expect(winnow([], 4)).toEqual([]);
    expect(winnow([3, 1, 2], 1).map((p) => p.pos)).toEqual([0, 1, 2]);
    expect(winnow([3, 1, 2, 1], 10)).toEqual([{ hash: 1, pos: 3 }]);
    expect(winnow([42], 4)).toEqual([{ hash: 42, pos: 0 }]);
  });

  it("window không hợp lệ → RangeError", () => {
    for (const w of [0, -1, 1.5, Number.NaN]) expect(() => winnow([1, 2, 3], w)).toThrow(RangeError);
  });

  it("property: bản O(n) trùng bản ngây thơ (nhiều giá trị trùng để thử hoà)", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -4, max: 4 }), { maxLength: 80 }), fc.integer({ min: 1, max: 12 }), (h, w) => {
        expect(winnow(h, w)).toEqual(naiveWinnow(h, w));
      }),
      { numRuns: 400 },
    );
  });

  it("property: vị trí tăng ngặt, hash đúng là băm tại vị trí đó, hai vị trí liền nhau cách ≤ window", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -1000, max: 1000 }), { minLength: 1, maxLength: 120 }), fc.integer({ min: 1, max: 10 }), (h, w) => {
        const out = winnow(h, w);
        out.forEach((p, i) => {
          expect(p.hash).toBe(h[p.pos]);
          if (i > 0) {
            expect(p.pos).toBeGreaterThan(out[i - 1].pos);
            expect(p.pos - out[i - 1].pos).toBeLessThanOrEqual(w);
          }
        });
      }),
    );
  });

  describe("bảo đảm bắt đoạn trùng ≥ window + k − 1 token", () => {
    const seed = hashSeedForAlgo(1);
    const symbols = fc.array(fc.integer({ min: 0, max: 30 }).map(String), { maxLength: 40 });

    const property = (k: number, window: number) =>
      fc.property(symbols, symbols, symbols, symbols, fc.array(fc.integer({ min: 0, max: 30 }).map(String), { minLength: window + k - 1, maxLength: window + k + 30 }), (prefixA, prefixB, suffixA, suffixB, shared) => {
        const fpA = new Set(winnow(kgramHashes([...prefixA, ...shared, ...suffixA], k, seed), window).map((p) => p.hash));
        const fpB = winnow(kgramHashes([...prefixB, ...shared, ...suffixB], k, seed), window).map((p) => p.hash);
        expect(fpB.some((h) => fpA.has(h))).toBe(true);
      });

    it("văn bản (k = 5, w = 4 → mọi đoạn chung ≥ 8 từ)", () => {
      fc.assert(property(PLAGIARISM_DEFAULTS.text.k, PLAGIARISM_DEFAULTS.text.window), { numRuns: 400 });
    });

    it("mã nguồn (k = 12, w = 8 → mọi đoạn chung ≥ 19 token)", () => {
      fc.assert(property(PLAGIARISM_DEFAULTS.code.k, PLAGIARISM_DEFAULTS.code.window), { numRuns: 400 });
    });

    it("ngưỡng là SẮC NÉT: chung ngắn hơn đúng 1 token (w + k − 2) thì có tài liệu không còn fingerprint chung nào — nên không được hạ w/k tuỳ tiện", () => {
      // PRNG có seed (mulberry32): dữ liệu tái lập, luôn có ít nhất một phản ví dụ trong 500 lần (thực đo ~17 % lần thiếu ở k=5, w=4).
      let a = 42;
      const rand = (): number => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const gen = (n: number): string[] => Array.from({ length: n }, () => String(Math.floor(rand() * 40)));
      const { k, window } = PLAGIARISM_DEFAULTS.text;
      let withoutCommon = 0;
      for (let i = 0; i < 500; i++) {
        const shared = gen(window + k - 2);
        const fpA = new Set(winnow(kgramHashes([...gen(20), ...shared, ...gen(20)], k, seed), window).map((p) => p.hash));
        const fpB = winnow(kgramHashes([...gen(20), ...shared, ...gen(20)], k, seed), window);
        if (!fpB.some((p) => fpA.has(p.hash))) withoutCommon++;
      }
      expect(withoutCommon).toBeGreaterThan(0);
    });
  });
});

describe("kgramHashes / hashTokenValues", () => {
  const seed = hashSeedForAlgo(1);

  it("độ dài n − k + 1; ít token hơn k (kể cả rỗng) → không có k-gram", () => {
    expect(kgramHashes(["a", "b", "c", "d", "e", "f"], 5, seed)).toHaveLength(2);
    expect(kgramHashes(["a", "b", "c", "d", "e"], 5, seed)).toHaveLength(1);
    expect(kgramHashes(["a", "b", "c", "d"], 5, seed)).toHaveLength(0);
    expect(kgramHashes([], 5, seed)).toHaveLength(0);
  });

  it("thứ tự token có ý nghĩa; cùng dãy ở vị trí khác nhau cho cùng hash", () => {
    expect(kgramHashes(["a", "b", "c"], 3, seed)[0]).not.toBe(kgramHashes(["c", "b", "a"], 3, seed)[0]);
    const h = kgramHashes(["x", "a", "b", "c", "y", "a", "b", "c"], 3, seed);
    expect(h[1]).toBe(h[5]);
  });

  it("hash k-gram đúng là murmur3 của các băm token (nhân chứng độc lập cho đường tính nhanh)", () => {
    const tokens = ["một", "hai", "ba"];
    const words = tokens.map((t) => murmur3Hash32(t, seed));
    const bytes = Buffer.alloc(12);
    words.forEach((w, i) => bytes.writeUInt32LE(w, i * 4));
    expect(kgramHashes(tokens, 3, seed)[0]).toBe(murmur3Hash32(bytes, seed) | 0);
  });

  it("là int32 có dấu (nhét được vào Prisma Int[])", () => {
    const tokens = Array.from({ length: 300 }, (_, i) => `t${i * 7919}`);
    const hashes = Array.from(kgramHashes(tokens, 3, seed));
    expect(hashes.every((x) => Number.isInteger(x) && x >= -0x80000000 && x <= 0x7fffffff)).toBe(true);
    expect(hashes.some((x) => x < 0)).toBe(true);
  });

  it("seed khác → hash khác; k không hợp lệ → RangeError", () => {
    const tokens = ["a", "b", "c", "d"];
    expect(kgramHashes(tokens, 2, hashSeedForAlgo(1))[0]).not.toBe(kgramHashes(tokens, 2, hashSeedForAlgo(2))[0]);
    for (const k of [0, -3, 2.5]) expect(() => kgramHashes(tokens, k, seed)).toThrow(RangeError);
  });

  it("hashTokenValues khớp murmur3 từng token (kể cả token lặp qua bộ nhớ đệm)", () => {
    const tokens = ["việt", "nam", "việt", "", "nam"];
    expect(Array.from(hashTokenValues(tokens, seed))).toEqual(tokens.map((t) => murmur3Hash32(t, seed)));
  });
});

describe("hashSeedForAlgo", () => {
  it("v1 là hằng cố định (đổi công thức mà không tăng ALGO_VERSION sẽ làm mọi fingerprint cũ vô nghĩa)", () => {
    expect(hashSeedForAlgo(1)).toBe(0x0970cb3d);
  });

  it("mỗi phiên bản một seed uint32 khác nhau, tất định", () => {
    const seeds = [1, 2, 3, 4, 5].map(hashSeedForAlgo);
    expect(new Set(seeds).size).toBe(5);
    expect(seeds.every((s) => Number.isInteger(s) && s >= 0 && s <= 0xffffffff)).toBe(true);
    expect(hashSeedForAlgo(3)).toBe(hashSeedForAlgo(3));
  });
});

describe("distinctSortedHashes", () => {
  const postings = (hashes: number[]): Posting[] => hashes.map((hash, pos) => ({ hash, pos }));

  it("loại trùng và sắp tăng dần theo giá trị int32 có dấu", () => {
    expect(distinctSortedHashes(postings([5, -3, 5, 9, -3]), 10)).toEqual({ hashes: [-3, 5, 9], truncated: false });
  });

  it("vượt trần → GIỮ HASH NHỎ NHẤT và báo truncated; đúng bằng trần thì không cắt", () => {
    expect(distinctSortedHashes(postings([9, 1, 5, 3, 7]), 3)).toEqual({ hashes: [1, 3, 5], truncated: true });
    expect(distinctSortedHashes(postings([9, 1, 5]), 3)).toEqual({ hashes: [1, 5, 9], truncated: false });
  });

  it("rỗng → rỗng, không cắt", () => {
    expect(distinctSortedHashes([], 5)).toEqual({ hashes: [], truncated: false });
  });
});

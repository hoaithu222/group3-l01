import {
  commonHashSet,
  containmentPercent,
  effectiveHashes,
  levelForScore,
  scoreTarget,
  unionHashes,
} from "../lib/match/containment";

/** Tập {start, …, start+count−1}: hash "giả" đủ để dựng kịch bản chấm điểm mà không cần văn bản thật. */
const range = (start: number, count: number): number[] => Array.from({ length: count }, (_, i) => start + i);
const set = (start: number, count: number): Set<number> => new Set(range(start, count));

describe("containmentPercent / levelForScore", () => {
  it("làm tròn XUỐNG bằng số nguyên; tổng 0 → 0; đủ → 100", () => {
    expect(containmentPercent(1, 3)).toBe(33);
    expect(containmentPercent(2, 3)).toBe(66);
    expect(containmentPercent(3, 3)).toBe(100);
    expect(containmentPercent(0, 5)).toBe(0);
    expect(containmentPercent(0, 0)).toBe(0);
    expect(containmentPercent(59, 100)).toBe(59);
    expect(containmentPercent(29, 100)).toBe(29);
  });

  it("LOW < 20 ≤ MEDIUM < 40 ≤ HIGH (ngưỡng mặc định) và ngưỡng tuỳ chỉnh", () => {
    expect(levelForScore(0)).toBe("LOW");
    expect(levelForScore(19)).toBe("LOW");
    expect(levelForScore(20)).toBe("MEDIUM");
    expect(levelForScore(39)).toBe("MEDIUM");
    expect(levelForScore(40)).toBe("HIGH");
    expect(levelForScore(100)).toBe("HIGH");
    expect(levelForScore(49, { medium: 50, high: 80 })).toBe("LOW");
    expect(levelForScore(80, { medium: 50, high: 80 })).toBe("HIGH");
  });
});

describe("commonHashSet (hash phổ biến trong workspace)", () => {
  it("cần cả ≥ 5 tài liệu VÀ ≥ 30 % số tài liệu", () => {
    const freq = new Map([[1, 3], [2, 5], [3, 4], [4, 10]]);
    // N = 10: hash 1 có 30 % nhưng chỉ 3 tài liệu → chưa phổ biến; hash 2 (5 tài liệu, 50 %) và 4 (10, 100 %) phổ biến; hash 3 (4 < 5) không.
    expect([...commonHashSet(freq, 10)].sort()).toEqual([2, 4]);
  });

  it("tỉ lệ so bằng số nguyên chính xác: N = 17 cần ≥ 5,1 tài liệu → 5 chưa đủ, 6 đủ", () => {
    expect(commonHashSet(new Map([[1, 5], [2, 6]]), 17).has(1)).toBe(false);
    expect(commonHashSet(new Map([[1, 5], [2, 6]]), 17).has(2)).toBe(true);
  });

  it("workspace lớn: tỉ lệ mới là ràng buộc — N = 100 cần ≥ 30 tài liệu", () => {
    const freq = new Map([[1, 29], [2, 30]]);
    expect([...commonHashSet(freq, 100)]).toEqual([2]);
  });

  it("tham số tuỳ chỉnh (admin chỉnh commonDocFrequencyPercent); không tài liệu nào → rỗng", () => {
    const freq = new Map([[1, 6]]);
    expect(commonHashSet(freq, 20, { frequencyPercent: 50 }).size).toBe(0);
    expect(commonHashSet(freq, 20, { frequencyPercent: 30 }).size).toBe(1);
    expect(commonHashSet(freq, 20, { minCount: 7, frequencyPercent: 5 }).size).toBe(0);
    expect(commonHashSet(new Map(), 0).size).toBe(0);
  });
});

describe("effectiveHashes / unionHashes", () => {
  it("H_A' = H_A trừ hash tệp loại trừ trừ hash phổ biến; đầu vào mảng hay tập đều được", () => {
    const out = effectiveHashes([1, 2, 3, 4, 5, 5], { excluded: new Set([2]), common: new Set([4]) });
    expect([...out].sort()).toEqual([1, 3, 5]);
    expect(effectiveHashes(new Set([7, 8])).size).toBe(2);
  });

  it("unionHashes gộp nhiều tập (H_excl = hợp hash của mọi tệp loại trừ)", () => {
    expect([...unionHashes([[1, 2], new Set([2, 3]), []])].sort()).toEqual([1, 2, 3]);
    expect(unionHashes([]).size).toBe(0);
  });
});

describe("scoreTarget", () => {
  it("trùng 100 %: điểm 100, HIGH", () => {
    const r = scoreTarget(set(0, 50), [{ id: "b", hashes: set(0, 50) }]);
    expect(r).toMatchObject({ score: 100, level: "HIGH", totalHashes: 50, coveredHashes: 50 });
    expect(r.sources).toEqual([{ id: "b", similarity: 100, shared: 50 }]);
  });

  it("không giao: điểm 0, LOW, không nguồn", () => {
    const r = scoreTarget(set(0, 50), [{ id: "b", hashes: set(1000, 50) }]);
    expect(r).toMatchObject({ score: 0, level: "LOW", coveredHashes: 0, sources: [] });
  });

  it("PLAG-01: sao chép 60 % → điểm ≥ 50 ở CẢ HAI phía; bài thứ ba không liên quan < 20", () => {
    const a = set(0, 100);
    const b = new Set([...range(0, 60), ...range(500, 40)]);
    const c = set(2000, 100);
    expect(scoreTarget(a, [{ id: "b", hashes: b }, { id: "c", hashes: c }]).score).toBe(60);
    expect(scoreTarget(b, [{ id: "a", hashes: a }, { id: "c", hashes: c }]).score).toBe(60);
    expect(scoreTarget(c, [{ id: "a", hashes: a }, { id: "b", hashes: b }]).score).toBeLessThan(20);
  });

  it("BẤT ĐỐI XỨNG đúng nghĩa: bài ngắn nằm trọn trong bài dài → 100 % ở bài ngắn, thấp ở bài dài", () => {
    const shortDoc = set(0, 20);
    const longDoc = set(0, 200);
    expect(scoreTarget(shortDoc, [{ id: "long", hashes: longDoc }]).score).toBe(100);
    expect(scoreTarget(longDoc, [{ id: "short", hashes: shortDoc }]).score).toBe(10);
  });

  it("điểm tệp là phần được phủ bởi HỢP các nguồn: hai nguồn mỗi cái phủ nửa khác nhau → 100, không phải 50", () => {
    const r = scoreTarget(set(0, 100), [
      { id: "b1", hashes: set(0, 50) },
      { id: "b2", hashes: set(50, 50) },
    ]);
    expect(r.score).toBe(100);
    expect(r.sources.map((s) => s.similarity)).toEqual([50, 50]);
    // Hai nguồn giao nhau nhiều không được cộng trùng.
    expect(scoreTarget(set(0, 100), [{ id: "b1", hashes: set(0, 50) }, { id: "b2", hashes: set(0, 50) }]).score).toBe(50);
  });

  it("PLAG-05: hash của tệp mẫu (loại trừ) và hash phổ biến không được tính → bài chỉ chung đề cương < 20", () => {
    const template = set(0, 80);
    const a = new Set([...template, ...range(1000, 20)]);
    const b = new Set([...template, ...range(2000, 20)]);
    expect(scoreTarget(a, [{ id: "b", hashes: b }]).score).toBe(80);
    const cleaned = effectiveHashes(a, { excluded: template });
    expect(scoreTarget(cleaned, [{ id: "b", hashes: b }]).score).toBe(0);
    const common = commonHashSet(new Map(range(0, 80).map((h) => [h, 8] as [number, number])), 10);
    expect(scoreTarget(effectiveHashes(a, { common }), [{ id: "b", hashes: b }]).score).toBeLessThan(20);
  });

  it("nguồn dưới minPairPercent bị bỏ (mặc định 5 %); nguồn 5 % thì giữ; ngưỡng tuỳ chỉnh", () => {
    const target = set(0, 100);
    expect(scoreTarget(target, [{ id: "x", hashes: set(0, 4) }]).sources).toEqual([]);
    expect(scoreTarget(target, [{ id: "x", hashes: set(0, 5) }]).sources).toHaveLength(1);
    expect(scoreTarget(target, [{ id: "x", hashes: set(0, 10) }], { minPairPercent: 20 }).sources).toEqual([]);
    expect(scoreTarget(target, [{ id: "x", hashes: set(0, 10) }], { minPairPercent: 0 }).sources).toHaveLength(1);
  });

  it("chỉ giữ tối đa candidateSourcesMax nguồn TỐT NHẤT; điểm chỉ tính trên nguồn giữ lại", () => {
    const target = set(0, 100);
    const sources = range(0, 5).map((i) => ({ id: `s${i}`, hashes: set(i * 10, 10 + i) }));
    const r = scoreTarget(target, sources, { candidateSourcesMax: 2 });
    expect(r.sources.map((s) => s.id)).toEqual(["s4", "s3"]);
    expect(r.coveredHashes).toBe(new Set([...range(40, 14), ...range(30, 13)]).size);
  });

  it("hoà thứ hạng: theo số hash chung rồi theo id (chuỗi, không phụ thuộc locale) — tất định, không phụ thuộc thứ tự đầu vào", () => {
    const target = set(0, 100);
    const a = { id: "a-doc", hashes: set(0, 10) };
    const b = { id: "B-doc", hashes: set(20, 10) };
    const c = { id: "c-doc", hashes: set(40, 10) };
    const forward = scoreTarget(target, [a, b, c]).sources.map((s) => s.id);
    const backward = scoreTarget(target, [c, b, a]).sources.map((s) => s.id);
    expect(forward).toEqual(["B-doc", "a-doc", "c-doc"]);
    expect(backward).toEqual(forward);
  });

  it("nguồn là mảng (DocumentFingerprint.hashes) hay tập cho cùng kết quả; hash lặp trong mảng không đếm hai lần", () => {
    const target = set(0, 10);
    const asSet = scoreTarget(target, [{ id: "b", hashes: set(0, 5) }]);
    const asArray = scoreTarget(target, [{ id: "b", hashes: [0, 1, 2, 3, 4, 4, 4] }]);
    expect(asArray).toEqual(asSet);
    expect(asSet.score).toBe(50);
  });

  it("đích rỗng (|H_A'| = 0): điểm 0 và totalHashes 0 để caller đặt SKIPPED NO_TEXT; không chia cho 0", () => {
    const r = scoreTarget(new Set(), [{ id: "b", hashes: set(0, 10) }]);
    expect(r).toEqual({ score: 0, level: "LOW", totalHashes: 0, coveredHashes: 0, sources: [] });
    expect(scoreTarget(set(0, 5), []).score).toBe(0);
  });

  it("mức theo ngưỡng snapshot của lượt quét", () => {
    const target = set(0, 100);
    const sources = [{ id: "b", hashes: set(0, 45) }];
    expect(scoreTarget(target, sources).level).toBe("HIGH");
    expect(scoreTarget(target, sources, { thresholds: { medium: 30, high: 60 } }).level).toBe("MEDIUM");
    expect(scoreTarget(target, sources, { thresholds: { medium: 50, high: 60 } }).level).toBe("LOW");
  });
});

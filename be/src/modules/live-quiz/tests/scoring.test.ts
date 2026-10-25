import { INITIAL_COMPOSITE, TIEBREAK_BASE, computePoints, decodeComposite, isPassing, scorePercent } from "../services/live-quiz-scoring";

const SCORING = { base: 1000, speedBonus: 500 };

describe("computePoints — điểm = base + speedBonus theo thời điểm server nhận (be.md §5)", () => {
  it("trả lời tức thì (elapsed 0) → base + toàn bộ speedBonus", () => {
    expect(computePoints(true, 0, 20, SCORING)).toBe(1500);
  });

  it("hết đúng thời gian (elapsed = số giây × 1000) → chỉ base", () => {
    expect(computePoints(true, 20_000, 20, SCORING)).toBe(1000);
  });

  it("nửa thời gian → base + nửa bonus (làm tròn xuống)", () => {
    expect(computePoints(true, 10_000, 20, SCORING)).toBe(1250);
    expect(computePoints(true, 10_001, 20, SCORING)).toBe(1249);
  });

  it("elapsed vượt hạn/âm được kẹp về [0, span]", () => {
    expect(computePoints(true, 99_999, 20, SCORING)).toBe(1000);
    expect(computePoints(true, -5, 20, SCORING)).toBe(1500);
  });

  it("sai/không trả lời → 0 điểm", () => {
    expect(computePoints(false, 0, 20, SCORING)).toBe(0);
  });
});

describe("điểm ghép ZSET (score × 10^7 + tie-break theo tổng ms)", () => {
  it("người mới vào giải mã ra score 0, cumulativeMs 0", () => {
    expect(decodeComposite(INITIAL_COMPOSITE)).toEqual({ score: 0, cumulativeMs: 0 });
  });

  it("cộng dồn từng câu đúng: score cộng, cumulativeMs cộng", () => {
    const afterTwo = INITIAL_COMPOSITE + (1500 * TIEBREAK_BASE - 200) + (1250 * TIEBREAK_BASE - 10_000);
    expect(decodeComposite(afterTwo)).toEqual({ score: 2750, cumulativeMs: 10_200 });
  });

  it("cùng điểm: tổng ms nhỏ hơn có điểm ghép lớn hơn (xếp trên)", () => {
    const fast = INITIAL_COMPOSITE + (1500 * TIEBREAK_BASE - 300);
    const slow = INITIAL_COMPOSITE + (1500 * TIEBREAK_BASE - 900);
    expect(fast).toBeGreaterThan(slow);
    expect(decodeComposite(fast).score).toBe(decodeComposite(slow).score);
  });

  it("50 câu × 1500 điểm vẫn nằm trong miền số nguyên an toàn của double", () => {
    const max = INITIAL_COMPOSITE + 50 * 1500 * TIEBREAK_BASE;
    expect(Number.isSafeInteger(max)).toBe(true);
    expect(decodeComposite(max).score).toBe(75_000);
  });
});

describe("scorePercent / isPassing", () => {
  it("tỉ lệ đúng làm tròn 2 chữ số; không có câu → 0", () => {
    expect(scorePercent(2, 3)).toBe(66.67);
    expect(scorePercent(0, 0)).toBe(0);
    expect(scorePercent(3, 3)).toBe(100);
  });

  it("đạt khi ≥ ngưỡng mặc định (50%)", () => {
    expect(isPassing(50)).toBe(true);
    expect(isPassing(49.99)).toBe(false);
  });
});

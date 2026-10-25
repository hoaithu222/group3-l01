import {
  between,
  evenKeys,
  generateKeyBetween,
  generateNKeysBetween,
  isValidPositionKey,
  needsRebalance,
} from "../services/task-position";
import vectors from "./fixtures/fractional-indexing-vectors.json";

/**
 * Vector sinh từ CHÍNH gói `fractional-indexing@3.2.0` (app dùng) — chứng minh bản tự cài đặt của BE
 * (gói là ESM-only, không import được vào CommonJS/ts-jest) sinh ĐÚNG cùng khoá.
 */
interface Pair { a: string | null; b: string | null; ok?: true | false; value?: string; error?: string }

describe("task-position — tương thích khoá với fractional-indexing@3.2.0", () => {
  it("ví dụ chuẩn trong yêu cầu", () => {
    expect(between(null, null)).toBe("a0");
    expect(between("a0", null)).toBe("a1");
    expect(between("a0", "a1")).toBe("a0V");
    expect(between("a0", "a2")).toBe("a1");
    expect(between(null, "a0")).toBe("Zz");
  });

  it.each((vectors.fixed as Pair[]).map((v) => [JSON.stringify([v.a, v.b]), v] as const))(
    "vector cố định %s",
    (_name, v) => {
      if (v.ok) expect(generateKeyBetween(v.a, v.b)).toBe(v.value);
      else expect(() => generateKeyBetween(v.a, v.b)).toThrow(v.error);
    }
  );

  it("400 phép chèn ngẫu nhiên (đầu/cuối/cùng khe) khớp từng khoá của gói gốc", () => {
    for (const step of vectors.walk as Required<Pair>[]) {
      expect(between(step.a, step.b)).toBe(step.value);
    }
  });

  it("chèn 350 lần vào cùng một khe: khớp gói gốc, khoá tăng dài, luôn nằm giữa hai biên", () => {
    let maxLength = 0;
    for (const step of vectors.slot as { a: string; b: string; value: string }[]) {
      const key = between(step.a, step.b);
      expect(key).toBe(step.value);
      expect(key > step.a && key < step.b).toBe(true);
      maxLength = Math.max(maxLength, key.length);
    }
    expect(maxLength).toBeGreaterThan(50);
  });

  it("generateNKeysBetween khớp gói gốc", () => {
    for (const v of vectors.nKeys as { a: string | null; b: string | null; n: number; value: string[] }[]) {
      expect(generateNKeysBetween(v.a, v.b, v.n)).toEqual(v.value);
    }
  });
});

describe("task-position — needsRebalance / evenKeys", () => {
  it("needsRebalance: > 50 ký tự mới cần nén", () => {
    expect(needsRebalance("a".repeat(50))).toBe(false);
    expect(needsRebalance("a".repeat(51))).toBe(true);
    expect(needsRebalance("a0V", 2)).toBe(true);
  });

  it("evenKeys(n): n khoá ngắn, tăng dần, phân biệt", () => {
    const keys = evenKeys(500);
    expect(new Set(keys).size).toBe(500);
    expect([...keys].sort()).toEqual(keys);
    expect(Math.max(...keys.map((k) => k.length))).toBeLessThanOrEqual(4);
    expect(evenKeys(0)).toEqual([]);
  });

  it("isValidPositionKey: chặn khoá rác/số 0 ở cuối", () => {
    expect(isValidPositionKey("a0")).toBe(true);
    expect(isValidPositionKey("a0V")).toBe(true);
    expect(isValidPositionKey("a00")).toBe(false);
    expect(isValidPositionKey("0")).toBe(false);
    expect(isValidPositionKey("")).toBe(false);
  });
});

import fc from "fast-check";
import { countLatestLevels, groupLevelDistribution, isSufficient, roundToStep, suppressSmall } from "../domain/anonymity";

/**
 * Domain THUẦN: ẩn danh hoá số liệu admin (p7-03 README §2 "Admin", WELL-04). Số nhóm nhỏ không bao giờ lộ; tổng luôn được bảo toàn khi gộp.
 */
describe("isSufficient / roundToStep / suppressSmall", () => {
  it("ngưỡng k = 20: 19 chưa đủ, 20 đủ", () => {
    expect(isSufficient(19, 20)).toBe(false);
    expect(isSufficient(20, 20)).toBe(true);
    expect(isSufficient(12, 20)).toBe(false);
  });

  it("làm tròn tới bội của 10", () => {
    expect([20, 24, 25, 26, 31, 99].map((n) => roundToStep(n, 10))).toEqual([20, 20, 30, 30, 30, 100]);
  });

  it("che ô nhỏ: 0 giữ, 1–4 → null, ≥ 5 giữ", () => {
    expect([0, 1, 4, 5, 12].map((n) => suppressSmall(n, 5))).toEqual([0, null, null, 5, 12]);
  });
});

describe("groupLevelDistribution", () => {
  it("mọi nhóm ≥ 5 → giữ nguyên thứ tự LOW/MEDIUM/HIGH, không có OTHER", () => {
    expect(groupLevelDistribution({ LOW: 30, MEDIUM: 8, HIGH: 5 }, 5, 20)).toEqual([
      { level: "LOW", count: 30 },
      { level: "MEDIUM", count: 8 },
      { level: "HIGH", count: 5 },
    ]);
  });

  it("nhóm < 5 gộp vào OTHER (Khác)", () => {
    expect(groupLevelDistribution({ LOW: 30, MEDIUM: 3, HIGH: 2 }, 5, 20)).toEqual([
      { level: "LOW", count: 30 },
      { level: "OTHER", count: 5 },
    ]);
  });

  it("OTHER vẫn < 5 → gộp thêm nhóm nhỏ nhất còn lại (không để lộ nhóm 1–4 người)", () => {
    expect(groupLevelDistribution({ LOW: 30, MEDIUM: 8, HIGH: 2 }, 5, 20)).toEqual([
      { level: "LOW", count: 30 },
      { level: "OTHER", count: 10 },
    ]);
    expect(groupLevelDistribution({ LOW: 40, MEDIUM: 0, HIGH: 4 }, 5, 20)).toEqual([{ level: "OTHER", count: 44 }]);
  });

  it("tổng số người được chấm < ngưỡng (20) → null; không ai → null", () => {
    expect(groupLevelDistribution({ LOW: 10, MEDIUM: 5, HIGH: 4 }, 5, 20)).toBeNull();
    expect(groupLevelDistribution({ LOW: 0, MEDIUM: 0, HIGH: 0 }, 5, 20)).toBeNull();
  });

  it("property: tổng bảo toàn, mọi nhóm công bố ≥ cellMin, không nhóm lặp", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 60 }), fc.integer({ min: 0, max: 60 }), fc.integer({ min: 0, max: 60 }), (LOW, MEDIUM, HIGH) => {
        const result = groupLevelDistribution({ LOW, MEDIUM, HIGH }, 5, 20);
        if (LOW + MEDIUM + HIGH < 20) return expect(result).toBeNull();
        expect(result).not.toBeNull();
        const buckets = result ?? [];
        expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(LOW + MEDIUM + HIGH);
        for (const b of buckets) expect(b.count).toBeGreaterThanOrEqual(5);
        expect(new Set(buckets.map((b) => b.level)).size).toBe(buckets.length);
      })
    );
  });
});

describe("countLatestLevels — mỗi người một lần, chỉ trả số đếm", () => {
  it("lấy đánh giá MỚI NHẤT của từng người", () => {
    const counts = countLatestLevels([
      { userId: "a", date: "2026-03-08", level: "HIGH" },
      { userId: "a", date: "2026-03-10", level: "LOW" },
      { userId: "b", date: "2026-03-09", level: "MEDIUM" },
      { userId: "c", date: "2026-03-10", level: "MEDIUM" },
    ]);
    expect(counts).toEqual({ LOW: 1, MEDIUM: 2, HIGH: 0 });
  });

  it("không có hàng → toàn 0; kết quả không chứa định danh", () => {
    expect(countLatestLevels([])).toEqual({ LOW: 0, MEDIUM: 0, HIGH: 0 });
    expect(Object.keys(countLatestLevels([{ userId: "a", date: "2026-03-10", level: "LOW" }])).sort()).toEqual(["HIGH", "LOW", "MEDIUM"]);
  });
});

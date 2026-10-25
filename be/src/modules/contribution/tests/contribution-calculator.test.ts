import fc from "fast-check";
import { DEFAULT_CONTRIBUTION_CONFIG, type ContributionConfigValue } from "../../../core/constants/contribution";
import { allocateShares, calculateContribution, isOnTime, type CalcReview, type CalcTask } from "../services/contribution-calculator";
import { explanationOf } from "../services/contribution-explain";

const VN = "Asia/Ho_Chi_Minh";
const config = (over: Partial<ContributionConfigValue> = {}): ContributionConfigValue => ({
  ...DEFAULT_CONTRIBUTION_CONFIG,
  weights: { ...DEFAULT_CONTRIBUTION_CONFIG.weights },
  ...over,
});

const DUE = new Date("2026-09-10T10:00:00Z"); // 17:00 VN ngày 10/09
const ON_TIME = new Date("2026-09-10T15:00:00Z"); // 22:00 VN cùng ngày — vẫn đúng hạn
const LATE = new Date("2026-09-11T02:00:00Z"); // 09:00 VN ngày 11/09

const task = (id: string, assignees: string[], storyPoints: number | null, over: Partial<CalcTask> = {}): CalcTask => ({
  taskId: id,
  assigneeIds: assignees,
  storyPoints,
  dueDate: DUE,
  completedAt: ON_TIME,
  ...over,
});
const review = (assignees: string[], score10: number | null): CalcReview => ({ assigneeIds: assignees, score10 });

/** PM2-33: An 8 điểm thẻ, đúng hạn 3/4, chấm TB 8,0 · Bình 4 điểm, 2/2, 7,0 · Chi không có gì. */
function fixture(binhHasDue = true) {
  const tasks: CalcTask[] = [
    task("t1", ["an"], 3),
    task("t2", ["an"], 2),
    task("t3", ["an"], 2),
    task("t4", ["an"], 1, { completedAt: LATE }),
    task("t5", ["binh"], 2, binhHasDue ? {} : { dueDate: null }),
    task("t6", ["binh"], 2, binhHasDue ? {} : { dueDate: null }),
  ];
  const reviews = [7, 8, 8, 8, 9].map((s) => review(["an"], s)).concat([review(["binh"], 7)]);
  return { tasks, reviews, memberIds: ["an", "binh", "chi"], config: config(), timezone: VN };
}

const byId = (r: ReturnType<typeof calculateContribution>, id: string) => r.members.find((m) => m.userId === id)!;

describe("calculateContribution — PM2-33 (công thức D-09)", () => {
  it("fixture chuẩn: An 91,0 · Bình 64,0 · Chi 0,0; % nhóm 58,7 / 41,3 / 0,0 và đủ số gốc", () => {
    const r = calculateContribution(fixture());
    const an = byId(r, "an");
    const binh = byId(r, "binh");
    const chi = byId(r, "chi");
    expect([an.score, binh.score, chi.score]).toEqual([91, 64, 0]);
    expect([an.share, binh.share, chi.share]).toEqual([58.7, 41.3, 0]);
    expect(an).toMatchObject({ storyPointsDone: 8, tasksDone: 4, tasksWithDue: 4, tasksOnTime: 3, tasksLate: 1, reviewCount: 5, peerScoreAvg: 8 });
    expect(an.components).toEqual({ points: 1, onTime: 0.75, peer: 0.8 });
    expect(binh).toMatchObject({ storyPointsDone: 4, tasksWithDue: 2, tasksOnTime: 2, tasksLate: 0, peerScoreAvg: 7 });
    expect(chi).toMatchObject({ storyPointsDone: 0, tasksDone: 0, tasksWithDue: 0, reviewCount: 0, peerScoreAvg: null });
    // Chi: chỉ thành phần điểm thẻ có dữ liệu (0/8 = 0) → điểm 0, trọng số dồn hết vào điểm thẻ.
    expect(chi.components).toEqual({ points: 0, onTime: null, peer: null });
    expect(chi.weightsUsed).toEqual({ points: 100, onTime: 0, peer: 0 });
    expect(r.totals).toEqual({ storyPointsDone: 12, tasksDone: 6 });
    expect(r.maxStoryPoints).toBe(8);
    expect(r.members.map((m) => m.userId)).toEqual(["an", "binh", "chi"]);
  });

  it("biến thể: Bình không thẻ có hạn → (60×0,5 + 20×0,7)/80×100 = 55,0, trọng số chia lại, ghi '20 % đúng hạn chia lại'", () => {
    const r = calculateContribution(fixture(false));
    const binh = byId(r, "binh");
    expect(binh.components.onTime).toBeNull();
    expect(binh.score).toBe(55);
    expect(binh.weightsUsed).toEqual({ points: 75, onTime: 0, peer: 25 });
    expect(explanationOf(binh, DEFAULT_CONTRIBUTION_CONFIG.weights, r.maxStoryPoints)).toBe("(60 × 4/8 + 20 × 7,0/10) ÷ 80 × 100 = 55,0 · 20 % đúng hạn chia lại");
    // An giữ nguyên, công thức đủ ba thành phần.
    expect(explanationOf(byId(r, "an"), DEFAULT_CONTRIBUTION_CONFIG.weights, r.maxStoryPoints)).toBe("60 × 8/8 + 20 × 3/4 + 20 × 8,0/10 = 91,0");
  });

  it("thẻ hai người làm: điểm chia đôi, mỗi người +1 thẻ, tổng nhóm tính một lần", () => {
    const r = calculateContribution({ tasks: [task("t", ["a", "b"], 5)], reviews: [], memberIds: [], config: config(), timezone: VN });
    expect(byId(r, "a")).toMatchObject({ storyPointsDone: 2.5, tasksDone: 1 });
    expect(byId(r, "b")).toMatchObject({ storyPointsDone: 2.5, tasksDone: 1 });
    expect(r.totals).toEqual({ storyPointsDone: 5, tasksDone: 1 });
  });

  it("thẻ chưa gán điểm tính unestimatedPoints và đếm vào unestimatedTasks", () => {
    const r = calculateContribution({
      tasks: [task("t1", ["a"], null), task("t2", ["a"], 3)],
      reviews: [],
      memberIds: ["a"],
      config: config({ unestimatedPoints: 1.5 }),
      timezone: VN,
    });
    expect(byId(r, "a")).toMatchObject({ storyPointsDone: 4.5, unestimatedTasks: 1, tasksDone: 2 });
  });

  it("mọi người 0 điểm thẻ → cPoints null (không chia cho 0), điểm 0, % 0", () => {
    const r = calculateContribution({ tasks: [], reviews: [], memberIds: ["a", "b"], config: config(), timezone: VN });
    for (const m of r.members) {
      expect(m.components).toEqual({ points: null, onTime: null, peer: null });
      expect(m).toMatchObject({ score: 0, share: 0, weightsUsed: { points: 0, onTime: 0, peer: 0 } });
    }
    expect(r.maxStoryPoints).toBe(0);
  });

  it("thẻ không có người làm bị bỏ qua; lượt chấm không điểm không vào điểm chấm", () => {
    const r = calculateContribution({
      tasks: [task("t", [], 8)],
      reviews: [review(["a"], null), review(["a"], 6)],
      memberIds: ["a"],
      config: config(),
      timezone: VN,
    });
    expect(r.totals).toEqual({ storyPointsDone: 0, tasksDone: 0 });
    expect(byId(r, "a")).toMatchObject({ reviewCount: 1, peerScoreAvg: 6, tasksDone: 0 });
  });

  it("người chỉ có trong fact (đã rời nhóm) vẫn có dòng; thành viên hiện tại chưa đóng góp có dòng 0", () => {
    const r = calculateContribution({ tasks: [task("t", ["gone"], 2)], reviews: [], memberIds: ["here"], config: config(), timezone: VN });
    expect(r.members.map((m) => m.userId).sort()).toEqual(["gone", "here"]);
    expect(byId(r, "gone").score).toBeGreaterThan(0);
    expect(byId(r, "here")).toMatchObject({ tasksDone: 0, score: 0 });
  });
});

describe("đúng hạn — cuối ngày hạn theo múi giờ + grace", () => {
  it("23:59 ngày hạn (giờ VN) vẫn đúng hạn, 00:00 hôm sau là trễ", () => {
    expect(isOnTime(new Date("2026-09-10T16:59:59Z"), DUE, VN, 0)).toBe(true);
    expect(isOnTime(new Date("2026-09-10T17:00:00Z"), DUE, VN, 0)).toBe(false);
  });
  it("grace 2 giờ nới thêm 2 giờ sau cuối ngày; thẻ không hạn → null", () => {
    expect(isOnTime(new Date("2026-09-10T18:30:00Z"), DUE, VN, 2)).toBe(true);
    expect(isOnTime(new Date("2026-09-10T19:00:00Z"), DUE, VN, 2)).toBe(false);
    expect(isOnTime(new Date(), null, VN, 2)).toBeNull();
  });
  it("hạn dùng ngày theo múi giờ của bảng, không phải UTC", () => {
    // 2026-09-10T20:00Z = 03:00 VN ngày 11/09 → hạn là ngày 11/09 VN (cuối ngày = 2026-09-11T17:00Z).
    const due = new Date("2026-09-10T20:00:00Z");
    expect(isOnTime(new Date("2026-09-11T16:00:00Z"), due, VN, 0)).toBe(true);
    expect(isOnTime(new Date("2026-09-11T16:00:00Z"), due, "UTC", 0)).toBe(false);
  });
  it("trọng số đổi 50/30/20 tính lại đúng", () => {
    const r = calculateContribution({ ...fixture(), config: config({ weights: { points: 50, onTime: 30, peer: 20 } }) });
    // An: 50×1 + 30×0,75 + 20×0,8 = 88,5
    expect(byId(r, "an").score).toBe(88.5);
  });
});

describe("allocateShares — phần dư lớn nhất", () => {
  it("ba điểm bằng nhau: 33,4 / 33,3 / 33,3 (hoà → theo userId), tổng đúng 100,0", () => {
    const shares = allocateShares(new Map([["c", 500], ["a", 500], ["b", 500]]));
    expect([shares.get("a"), shares.get("b"), shares.get("c")]).toEqual([33.4, 33.3, 33.3]);
  });
  it("tổng điểm 0 → mọi người 0", () => {
    expect([...allocateShares(new Map([["a", 0], ["b", 0]])).values()]).toEqual([0, 0]);
  });
  it("thuộc tính: với điểm bất kỳ, tổng % luôn đúng 100,0 và mỗi % lệch tối đa 0,1 so với tỉ lệ thật", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 12 }), (scores) => {
        const total = scores.reduce((a, b) => a + b, 0);
        const shares = allocateShares(new Map(scores.map((s, i) => [`u${String(i).padStart(2, "0")}`, s])));
        const values = [...shares.values()];
        if (total === 0) return values.every((v) => v === 0);
        const sumTenths = values.reduce((a, v) => a + Math.round(v * 10), 0);
        const close = scores.every((s, i) => Math.abs((shares.get(`u${String(i).padStart(2, "0")}`) ?? 0) - (s * 100) / total) <= 0.1 + 1e-9);
        return sumTenths === 1000 && close;
      })
    );
  });
});

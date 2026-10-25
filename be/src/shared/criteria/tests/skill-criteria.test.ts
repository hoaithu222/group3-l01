import { normalizeSkillLabel } from "../../../core/utils/normalize";
import { evaluateCriteria, meetsThresholds, thresholdGaps } from "../criteria-evaluator";
import {
  avgPeerScoreX10,
  evaluateSkillCriteria,
  isCriteriaHarder,
  skillCriteriaSchema,
  skillRemaining,
  toDisplayCriteria,
  toStoredCriteria,
} from "../skill-criteria";

describe("normalizeSkillLabel (CR-21)", () => {
  it("'Node.js', 'node js', 'NODEJS' cùng về `nodejs`; 'React JS' → `reactjs`", () => {
    expect(["Node.js", "node js", "NODEJS", " Node-JS "].map(normalizeSkillLabel)).toEqual(["nodejs", "nodejs", "nodejs", "nodejs"]);
    expect(normalizeSkillLabel("React JS")).toBe("reactjs");
  });

  it("bỏ dấu tiếng Việt; C++ / C# không cùng rơi về `c`; chuỗi toàn ký hiệu → rỗng", () => {
    expect(normalizeSkillLabel("Cơ sở dữ liệu")).toBe("cosodulieu");
    expect(normalizeSkillLabel("Trưởng nhóm")).toBe("truongnhom");
    expect(normalizeSkillLabel("truong-nhom")).toBe("truongnhom");
    expect(normalizeSkillLabel("C++")).toBe("cplusplus");
    expect(normalizeSkillLabel("C#")).toBe("csharp");
    expect(normalizeSkillLabel("...")).toBe("");
  });
});

describe("lõi ngưỡng dùng chung (criteria-evaluator — p4-03 + p6-06)", () => {
  it("meetsThresholds: `min = null` luôn đạt; biên `current = min` đạt", () => {
    expect(meetsThresholds([{ key: "a", current: 5, min: 5 }, { key: "b", current: 0, min: null }])).toBe(true);
    expect(meetsThresholds([{ key: "a", current: 4, min: 5 }])).toBe(false);
    expect(thresholdGaps([{ key: "a", current: 3, min: 5 }, { key: "b", current: 9, min: 5 }, { key: "c", current: 0, min: null }])).toEqual({ a: 2, b: 0, c: 0 });
  });

  it("evaluateCriteria của huy hiệu gamification không đổi hành vi", () => {
    expect(evaluateCriteria({ all: [{ counter: "tasksDone", op: "gte", value: 10 }] }, { tasksDone: 10 })).toBe(true);
    expect(evaluateCriteria({ all: [{ counter: "tasksDone", op: "gte", value: 10 }], any: [{ counter: "level", op: "gte", value: 3 }] }, { tasksDone: 10, level: 2 })).toBe(false);
  });
});

describe("tiêu chí kỹ năng", () => {
  const stored = toStoredCriteria({ requiredTasksDone: 50, minStoryPoints: 2.5, minAvgPeerScore: 8, requireReview: true });

  it("lưu ×10 số nguyên, hiển thị lại đúng số thực", () => {
    expect(stored).toEqual({ requiredTasksDone: 50, minStoryPointsX10: 25, minAvgPeerScoreX10: 80, requireReview: true });
    expect(toDisplayCriteria(stored)).toEqual({ requiredTasksDone: 50, minStoryPoints: 2.5, minAvgPeerScore: 8, requireReview: true });
    expect(toStoredCriteria({ requiredTasksDone: 1, requireReview: false })).toEqual({ requiredTasksDone: 1, minStoryPointsX10: null, minAvgPeerScoreX10: null, requireReview: false });
  });

  it("schema: requiredTasksDone 1–500, điểm review ≤ 10, trường lạ bị từ chối", () => {
    expect(skillCriteriaSchema.safeParse({ requiredTasksDone: 0, requireReview: false }).success).toBe(false);
    expect(skillCriteriaSchema.safeParse({ requiredTasksDone: 501, requireReview: false }).success).toBe(false);
    expect(skillCriteriaSchema.safeParse({ requiredTasksDone: 5, minAvgPeerScore: 10.5, requireReview: false }).success).toBe(false);
    expect(skillCriteriaSchema.safeParse({ requiredTasksDone: 5, requireReview: false, extra: 1 }).success).toBe(false);
  });

  it("đánh giá ở biên: đủ 50 task, 2,5 điểm, TB 8,0, 50 task đã chấm → đạt; thiếu một thứ → chưa", () => {
    const ok = { tasksDone: 50, storyPointsX10: 25, reviewScoreSumX10: 80 * 50, reviewScoreCount: 50 };
    expect(evaluateSkillCriteria(stored, ok)).toBe(true);
    expect(evaluateSkillCriteria(stored, { ...ok, tasksDone: 49 })).toBe(false);
    expect(evaluateSkillCriteria(stored, { ...ok, storyPointsX10: 24 })).toBe(false);
    expect(evaluateSkillCriteria(stored, { ...ok, reviewScoreSumX10: 79 * 50 })).toBe(false);
    // requireReview: mọi task tính phải qua chấm.
    expect(evaluateSkillCriteria(stored, { ...ok, tasksDone: 60, reviewScoreCount: 49, reviewScoreSumX10: 80 * 49 })).toBe(false);
  });

  it("TB review làm tròn nửa lên; chưa ai chấm → null (và không đạt ngưỡng > 0)", () => {
    expect(avgPeerScoreX10({ reviewScoreSumX10: 245, reviewScoreCount: 3 })).toBe(82);
    expect(avgPeerScoreX10({ reviewScoreSumX10: 0, reviewScoreCount: 0 })).toBeNull();
    const avgOnly = toStoredCriteria({ requiredTasksDone: 1, minAvgPeerScore: 7, requireReview: false });
    expect(evaluateSkillCriteria(avgOnly, { tasksDone: 3, storyPointsX10: 0, reviewScoreSumX10: 0, reviewScoreCount: 0 })).toBe(false);
  });

  it("còn thiếu: 12 task, 0,5 điểm, 0,3 điểm review", () => {
    const r = skillRemaining(stored, { tasksDone: 38, storyPointsX10: 20, reviewScoreSumX10: 77 * 38, reviewScoreCount: 38 });
    expect(r).toEqual({ tasks: 12, storyPointsX10: 5, peerScoreX10: 3, reviewedTasks: 12 });
  });

  it("isCriteriaHarder: tăng ngưỡng / bật requireReview → khó hơn; giảm → không", () => {
    const base = toStoredCriteria({ requiredTasksDone: 10, minAvgPeerScore: 7, requireReview: false });
    expect(isCriteriaHarder(base, { ...base, requiredTasksDone: 11 })).toBe(true);
    expect(isCriteriaHarder(base, { ...base, minStoryPointsX10: 10 })).toBe(true);
    expect(isCriteriaHarder(base, { ...base, requireReview: true })).toBe(true);
    expect(isCriteriaHarder(base, { ...base, requiredTasksDone: 5, minAvgPeerScoreX10: null })).toBe(false);
  });
});

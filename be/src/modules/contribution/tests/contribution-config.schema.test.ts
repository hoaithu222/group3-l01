import { CONTRIBUTION_DEFAULTS_CONFIG_KEY, DEFAULT_CONTRIBUTION_CONFIG } from "../../../core/constants/contribution";
import { SYSTEM_CONFIG_REGISTRY } from "../../../core/config/system-config.registry";
import { boardContributionConfigSchema, cloneConfig, parseBoardContribution, putContributionConfigSchema } from "../services/contribution-config.schema";

describe("contribution-config.schema — nguồn duy nhất của Board.contribution", () => {
  it("cấu hình hợp lệ (tổng 100) qua schema, mặc định grace 0 / điểm chưa gán 1", () => {
    const r = boardContributionConfigSchema.parse({ weights: { points: 50, onTime: 30, peer: 20 } });
    expect(r).toEqual({ weights: { points: 50, onTime: 30, peer: 20 }, onTimeGraceHours: 0, unestimatedPoints: 1 });
  });

  it("tổng ≠ 100, số thực, âm, vượt 100 → từ chối", () => {
    for (const weights of [{ points: 50, onTime: 30, peer: 30 }, { points: 60.5, onTime: 19.5, peer: 20 }, { points: -10, onTime: 60, peer: 50 }, { points: 101, onTime: 0, peer: -1 }]) {
      expect(boardContributionConfigSchema.safeParse({ weights }).success).toBe(false);
    }
  });

  it("grace 0–72 giờ; điểm chưa gán 0–13 bước 0,5", () => {
    const w = { points: 60, onTime: 20, peer: 20 };
    expect(boardContributionConfigSchema.safeParse({ weights: w, onTimeGraceHours: 73 }).success).toBe(false);
    expect(boardContributionConfigSchema.safeParse({ weights: w, onTimeGraceHours: 72, unestimatedPoints: 13 }).success).toBe(true);
    expect(boardContributionConfigSchema.safeParse({ weights: w, unestimatedPoints: 0.3 }).success).toBe(false);
    expect(boardContributionConfigSchema.safeParse({ weights: w, unestimatedPoints: 13.5 }).success).toBe(false);
  });

  it("thân PUT nghiêm ngặt: trường lạ (members, score) bị từ chối — cấu hình không nhận giá trị theo người", () => {
    const ok = { weights: { points: 60, onTime: 20, peer: 20 }, expectedVersion: 1 };
    expect(putContributionConfigSchema.safeParse(ok).success).toBe(true);
    expect(putContributionConfigSchema.safeParse({ ...ok, members: [{ userId: "x", score: 100 }] }).success).toBe(false);
    expect(putContributionConfigSchema.safeParse({ ...ok, weights: { ...ok.weights, bonus: 5 } }).success).toBe(false);
    expect(putContributionConfigSchema.safeParse({ weights: ok.weights }).success).toBe(false);
  });

  it("thân PUT KHÔNG tự kiểm tổng 100 (mã CONTRIB_002 do service ném)", () => {
    expect(putContributionConfigSchema.safeParse({ weights: { points: 50, onTime: 30, peer: 30 }, expectedVersion: 1 }).success).toBe(true);
  });

  it("parseBoardContribution: JSON hỏng/thiếu → rơi về mặc định (bản sao độc lập)", () => {
    for (const raw of [null, undefined, "x", { weights: { points: 1, onTime: 1, peer: 1 } }, { weights: { points: 60, onTime: 20 } }]) {
      const parsed = parseBoardContribution(raw);
      expect(parsed).toEqual(DEFAULT_CONTRIBUTION_CONFIG);
      expect(parsed.weights).not.toBe(DEFAULT_CONTRIBUTION_CONFIG.weights);
    }
    expect(parseBoardContribution({ weights: { points: 40, onTime: 40, peer: 20 }, onTimeGraceHours: 6, unestimatedPoints: 2 })).toEqual({
      weights: { points: 40, onTime: 40, peer: 20 },
      onTimeGraceHours: 6,
      unestimatedPoints: 2,
    });
  });

  it("cloneConfig không dùng chung tham chiếu", () => {
    const copy = cloneConfig(DEFAULT_CONTRIBUTION_CONFIG);
    copy.weights.points = 1;
    expect(DEFAULT_CONTRIBUTION_CONFIG.weights.points).toBe(60);
  });
});

describe("SystemConfig pm.contribution", () => {
  const def = SYSTEM_CONFIG_REGISTRY[CONTRIBUTION_DEFAULTS_CONFIG_KEY]!;

  it("mặc định registry khớp hằng mã nguồn D-09 (60/20/20, grace 0, chưa gán 1) và thuộc tab pm", () => {
    expect(def.tab).toBe("pm");
    const defaults = Object.fromEntries(def.fields.map((f) => [f.path, f.default]));
    expect(defaults).toEqual({ weights: DEFAULT_CONTRIBUTION_CONFIG.weights, onTimeGraceHours: 0, unestimatedPoints: 1 });
    expect(def.fields.every((f) => f.kind === "json")).toBe(true);
  });

  it("schema từ chối tổng ≠ 100 và grace > 72; nhận cấu hình hợp lệ từng phần", () => {
    expect(def.schema.safeParse({ weights: { points: 50, onTime: 30, peer: 30 } }).success).toBe(false);
    expect(def.schema.safeParse({ onTimeGraceHours: 73 }).success).toBe(false);
    expect(def.schema.safeParse({ unestimatedPoints: 2.25 }).success).toBe(false);
    expect(def.schema.safeParse({ weights: { points: 50, onTime: 30, peer: 20 }, onTimeGraceHours: 12, unestimatedPoints: 2.5 }).success).toBe(true);
    expect(def.schema.safeParse({}).success).toBe(true);
  });
});

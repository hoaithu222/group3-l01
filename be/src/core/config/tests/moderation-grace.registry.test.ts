import { LIMITS } from "../../constants/limits";
import { SYSTEM_CONFIG_REGISTRY } from "../system-config.registry";

/** p1-08 be.md §9 / README §5: thời hạn xem nội dung riêng tư sau khi đóng báo cáo là khoá `SystemConfig` (không còn hằng số cố định). */
describe("SYSTEM_CONFIG_REGISTRY['moderation.privateViewGraceHours']", () => {
  const def = SYSTEM_CONFIG_REGISTRY["moderation.privateViewGraceHours"]!;

  it("có trong registry, tab limits, ảnh hưởng runtime, đúng tên khoá 2 đoạn", () => {
    expect(def).toBeDefined();
    expect(def.key).toBe("moderation.privateViewGraceHours");
    expect(def.tab).toBe("limits");
    expect(def.affects).toEqual(["runtime"]);
  });

  it("MỘT trường `value` (giờ) mặc định = LIMITS.report.privateViewGraceHours, sàn 1, trần 168 (7 ngày)", () => {
    expect(def.fields).toHaveLength(1);
    expect(def.fields[0]).toMatchObject({ path: "value", kind: "int", default: LIMITS.report.privateViewGraceHours, floor: 1, ceil: 168 });
  });

  it("schema nhận value nguyên, từ chối giá trị không nguyên/kiểu khác", () => {
    expect(def.schema.safeParse({ value: 48 }).success).toBe(true);
    expect(def.schema.safeParse({}).success).toBe(true);
    expect(def.schema.safeParse({ value: 1.5 }).success).toBe(false);
    expect(def.schema.safeParse({ value: "24" }).success).toBe(false);
  });
});

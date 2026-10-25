import { SYSTEM_CONFIG_REGISTRY } from "../system-config.registry";
import { LIMITS } from "../../constants/limits";

describe("SYSTEM_CONFIG_REGISTRY['notification.defaults'] (p1-07 be.md §9)", () => {
  const def = SYSTEM_CONFIG_REGISTRY["notification.defaults"];

  it("nằm ở tab notifications, chỉ ảnh hưởng runtime (không đổi capabilities)", () => {
    expect(def.tab).toBe("notifications");
    expect(def.affects).toEqual(["runtime"]);
  });

  it("mặc định khớp LIMITS.notification.defaults: 1-1/nhóm ALL, kênh MENTIONS_AND_THREADS, màn hình khoá HIDDEN, sound bật", () => {
    const byPath = Object.fromEntries(def.fields.map((f) => [f.path, f.default]));
    expect(byPath).toEqual({
      directMode: "ALL",
      groupMode: "ALL",
      channelMode: "MENTIONS_AND_THREADS",
      lockScreenPreview: "HIDDEN",
      sound: true,
    });
    expect(byPath).toEqual(LIMITS.notification.defaults);
  });

  it("field enum khai options (admin sinh <select>); sound là bool", () => {
    const fields = Object.fromEntries(def.fields.map((f) => [f.path, f]));
    expect(fields.directMode).toMatchObject({ kind: "enum", options: ["ALL", "MENTIONS_AND_THREADS", "MUTED"] });
    expect(fields.lockScreenPreview).toMatchObject({ kind: "enum", options: ["HIDDEN", "SENDER", "FULL"] });
    expect(fields.sound?.kind).toBe("bool");
  });

  it("schema chấp nhận giá trị hợp lệ (partial) và từ chối giá trị lạ", () => {
    expect(def.schema.safeParse({ directMode: "MUTED", sound: false }).success).toBe(true);
    expect(def.schema.safeParse({}).success).toBe(true);
    expect(def.schema.safeParse({ directMode: "MENTIONS" }).success).toBe(false);
    expect(def.schema.safeParse({ lockScreenPreview: "SHOW" }).success).toBe(false);
  });
});

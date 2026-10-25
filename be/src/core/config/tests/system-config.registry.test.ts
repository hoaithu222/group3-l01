import { SYSTEM_CONFIG_REGISTRY } from "../system-config.registry";
import { MODULES, SUB_FEATURE_IDS, SUB_FEATURE_LABELS, SUB_FEATURES, subFeatureDefault } from "../../constants/modules";
import { LIMITS } from "../../constants/limits";
import { env } from "../env.schema";
import { parseSize } from "../../utils/size";
import { systemConfigKeyParamSchema } from "../../../modules/system-config/dtos/update-system-config.dto";

describe("SYSTEM_CONFIG_REGISTRY", () => {
  it("mỗi khoá có schema Zod + ít nhất metadata cơ bản (tab/label)", () => {
    for (const def of Object.values(SYSTEM_CONFIG_REGISTRY)) {
      expect(def.schema).toBeDefined();
      expect(def.tab).toBeDefined();
      expect(def.label.length).toBeGreaterThan(0);
    }
  });

  it("limits.upload.maxFileBytes: ceil là hàm, = min(LIMITS gốc, MAX_FILE_SIZE env)", () => {
    const field = SYSTEM_CONFIG_REGISTRY["limits.upload"]!.fields[0]!;
    expect(typeof field.ceil).toBe("function");
    const ceil = (field.ceil as () => number)();
    expect(ceil).toBe(Math.min(LIMITS.upload.maxFileBytes, parseSize(env.MAX_FILE_SIZE)));
  });

  it("features: field lạ không thể lọt qua schema (chỉ chấp nhận ModuleId)", () => {
    const def = SYSTEM_CONFIG_REGISTRY.features!;
    const result = def.schema.safeParse({ "khong-ton-tai": true });
    expect(result.success).toBe(false);
  });

  it("features: field hợp lệ (module thật) qua được schema", () => {
    const def = SYSTEM_CONFIG_REGISTRY.features!;
    const result = def.schema.safeParse({ [MODULES.COMMUNICATION]: true });
    expect(result.success).toBe(true);
  });

  it("features: cờ phụ (p5-04, p7-04) nằm trong schema + fields, mặc định BẬT (trừ `gif` — chưa có nhà cung cấp), không phải ModuleId", () => {
    const def = SYSTEM_CONFIG_REGISTRY.features!;
    for (const id of SUB_FEATURE_IDS) {
      expect(def.schema.safeParse({ [id]: false }).success).toBe(true);
      const field = def.fields.find((f) => f.path === id);
      expect(field).toMatchObject({ kind: "bool", default: subFeatureDefault(id) });
      expect(field?.label).toBe(SUB_FEATURE_LABELS[id]);
      expect(Object.values(MODULES) as string[]).not.toContain(id);
    }
    expect(def.schema.safeParse({ workspaceSearch: "yes" }).success).toBe(false);
    // p7-04: đủ 6 cờ phụ của mở rộng chat; chỉ `gif` mặc định TẮT.
    for (const id of [SUB_FEATURES.POLLS, SUB_FEATURES.SCHEDULED_MESSAGES, SUB_FEATURES.MESSAGE_REMINDERS, SUB_FEATURES.MESSAGE_TO_TASK, SUB_FEATURES.MESSAGE_TO_RESOURCE, SUB_FEATURES.GIF]) {
      expect(SUB_FEATURE_IDS).toContain(id);
    }
    expect(SUB_FEATURE_IDS.filter((id) => !subFeatureDefault(id))).toEqual([SUB_FEATURES.GIF]);
  });

  it("limits.poll|scheduledMessage|reminder (p7-04): chỉ HẠ được so với trần cứng của LIMITS", () => {
    for (const key of ["limits.poll", "limits.scheduledMessage", "limits.reminder"] as const) {
      const def = SYSTEM_CONFIG_REGISTRY[key]!;
      expect(def.tab).toBe("limits");
      for (const f of def.fields) {
        expect(f.kind).toBe("int");
        expect(f.ceil).toBe(f.default);
        expect((f.floor ?? 0) <= (f.default as number)).toBe(true);
      }
    }
  });

  it("auth: field lồng đúng path (biometricLogin.enabled, appLock.*)", () => {
    const def = SYSTEM_CONFIG_REGISTRY.auth!;
    const paths = def.fields.map((f) => f.path);
    expect(paths).toEqual(
      expect.arrayContaining(["biometricLogin.enabled", "appLock.enabled", "appLock.lockAfterBackgroundSeconds"])
    );
  });

  it("auth: schema chấp nhận value lồng hợp lệ", () => {
    const def = SYSTEM_CONFIG_REGISTRY.auth!;
    const result = def.schema.safeParse({ biometricLogin: { enabled: false } });
    expect(result.success).toBe(true);
  });

  it("limits.call: floor/ceil khớp canonical be.md §3 (20-60/2-16/10-60/300-3600)", () => {
    const fields = Object.fromEntries(SYSTEM_CONFIG_REGISTRY["limits.call"]!.fields.map((f) => [f.path, f]));
    expect(fields.ringTimeoutSeconds).toMatchObject({ floor: 20, ceil: 60 });
    expect(fields.maxParticipants).toMatchObject({ floor: 2, ceil: 16 });
    expect(fields.tokenTtlSeconds).toMatchObject({ floor: 300, ceil: 3600 });
  });

  it("đơn vị khai đúng theo hậu tố tên field: *Seconds → s, *Minutes → min, *Days → days", () => {
    // `unit` chỉ để admin hiển thị hậu tố ô nhập — khai sai ("s" cho số phút) làm admin ghi "giây".
    for (const def of Object.values(SYSTEM_CONFIG_REGISTRY)) {
      for (const f of def.fields) {
        if (/Seconds$/.test(f.path) && f.unit) expect({ path: f.path, unit: f.unit }).toEqual({ path: f.path, unit: "s" });
        if (/Minutes$/.test(f.path)) expect({ path: f.path, unit: f.unit }).toEqual({ path: f.path, unit: "min" });
        if (/Days$/.test(f.path)) expect({ path: f.path, unit: f.unit }).toEqual({ path: f.path, unit: "days" });
      }
    }
  });
});

describe("SYSTEM_CONFIG_REGISTRY — khoá Phase 3 (D-28)", () => {
  const fieldMap = (key: string) => Object.fromEntries(SYSTEM_CONFIG_REGISTRY[key]!.fields.map((f) => [f.path, f]));

  it("limits.resource (tab storage): mặc định = LIMITS.resource, quota trong 0,5–100 GiB, ngày thùng rác 7–90", () => {
    const def = SYSTEM_CONFIG_REGISTRY["limits.resource"]!;
    expect(def.tab).toBe("storage");
    const f = fieldMap("limits.resource");
    expect(f.workspaceQuotaBytes).toMatchObject({
      kind: "bytes",
      default: LIMITS.resource.workspaceQuotaBytes,
      floor: 512 * 1024 * 1024,
      ceil: 100 * 1024 * 1024 * 1024,
    });
    expect(f.trashRetentionDays).toMatchObject({ kind: "int", default: 30, floor: 7, ceil: 90, unit: "days" });
  });

  it("limits.board / limits.task (tab pm): trần cứng = LIMITS; perWorkspaceMax nâng được tới 100", () => {
    expect(SYSTEM_CONFIG_REGISTRY["limits.board"]!.tab).toBe("pm");
    expect(SYSTEM_CONFIG_REGISTRY["limits.task"]!.tab).toBe("pm");
    expect(fieldMap("limits.board").columnsMax).toMatchObject({ default: 12, floor: 2, ceil: 12 });
    expect(fieldMap("limits.board").perWorkspaceMax).toMatchObject({ default: 20, floor: 1, ceil: 100 });
    expect(fieldMap("limits.task").perBoardMax).toMatchObject({ default: 5000, ceil: 5000 });
  });

  it("limits.guest: enabledByDefault (bool, mặc định false) + ngày/khách theo LIMITS.guest", () => {
    const f = fieldMap("limits.guest");
    expect(f.enabledByDefault).toMatchObject({ kind: "bool", default: false });
    expect(f.defaultDays).toMatchObject({ default: 30, ceil: 90, unit: "days" });
    expect(f.maxDays).toMatchObject({ default: 90, ceil: 90, unit: "days" });
    expect(f.maxPerWorkspace).toMatchObject({ default: 20, floor: 0, ceil: 20 });
  });

  it("pm.defaultColumns (kind json): mặc định hợp lệ; 0/2 cột DONE, < 2 cột, > 12 cột bị từ chối", () => {
    const def = SYSTEM_CONFIG_REGISTRY.pm!;
    expect(def.tab).toBe("pm");
    expect(def.fields[0]).toMatchObject({ path: "defaultColumns", kind: "json" });
    expect(def.schema.safeParse({ defaultColumns: def.fields[0]!.default }).success).toBe(true);

    const col = (kind: string, title = "Cột") => ({ title, kind });
    expect(def.schema.safeParse({ defaultColumns: [col("TODO"), col("IN_PROGRESS")] }).success).toBe(false); // 0 DONE
    expect(def.schema.safeParse({ defaultColumns: [col("DONE"), col("DONE")] }).success).toBe(false); // 2 DONE
    expect(def.schema.safeParse({ defaultColumns: [col("DONE")] }).success).toBe(false); // < 2 cột
    const thirteen = Array.from({ length: 13 }, (_, i) => col(i === 12 ? "DONE" : "TODO"));
    expect(def.schema.safeParse({ defaultColumns: thirteen }).success).toBe(false); // > 12 cột
    expect(def.schema.safeParse({ defaultColumns: [col("TODO"), col("DONE")] }).success).toBe(true);
    expect(def.schema.safeParse({ defaultColumns: [{ title: "x", kind: "KHAC" }, col("DONE")] }).success).toBe(false);
  });

  it("p4-04: limits.task đăng ký thêm 5 trần phụ thuộc/dời lịch (chỉ HẠ được: ceil = LIMITS) và giữ nguyên perBoardMax", () => {
    const def = SYSTEM_CONFIG_REGISTRY["limits.task"]!;
    const f = Object.fromEntries(def.fields.map((x) => [x.path, x]));
    expect(def.fields[0]).toMatchObject({ path: "perBoardMax", default: 5000, floor: 100, ceil: 5000 }); // hành vi cũ không đổi
    expect(f.dependenciesMax).toMatchObject({ kind: "int", default: 50, ceil: 50, floor: 1 });
    expect(f.dependencyGraphVisitMax).toMatchObject({ default: 5000, ceil: 5000, floor: 100 });
    expect(f.rescheduleSyncMax).toMatchObject({ default: 200, ceil: 200, floor: 1 });
    expect(f.rescheduleBulkMax).toMatchObject({ default: 5000, ceil: 5000, floor: 1 });
    expect(f.rescheduleEmitEachMax).toMatchObject({ default: 50, ceil: 50, floor: 0 });
    expect(def.schema.safeParse({ rescheduleSyncMax: 100, perBoardMax: 1000 }).success).toBe(true);
    expect(def.schema.safeParse({ rescheduleSyncMax: 1.5 }).success).toBe(false);
  });

  it("p4-04: limits.gantt (tab pm): rangeMaxDays 7–366, tasksMax 50–2000 theo LIMITS.gantt", () => {
    const def = SYSTEM_CONFIG_REGISTRY["limits.gantt"]!;
    expect(def.tab).toBe("pm");
    const f = Object.fromEntries(def.fields.map((x) => [x.path, x]));
    expect(f.rangeMaxDays).toMatchObject({ default: LIMITS.gantt.rangeMaxDays, ceil: LIMITS.gantt.rangeMaxDays, floor: 7, unit: "days" });
    expect(f.tasksMax).toMatchObject({ default: LIMITS.gantt.tasksMax, ceil: LIMITS.gantt.tasksMax, floor: 50, unit: "count" });
    expect(def.schema.safeParse({ rangeMaxDays: 30 }).success).toBe(true);
  });

  it("p4-04: pm.timezone (enum) — múi giờ IANA hợp lệ, mặc định Asia/Ho_Chi_Minh; defaultColumns vẫn là field đầu", () => {
    const def = SYSTEM_CONFIG_REGISTRY.pm!;
    const tz = def.fields.find((x) => x.path === "timezone");
    expect(tz).toMatchObject({ kind: "enum", default: "Asia/Ho_Chi_Minh" });
    expect(tz?.options).toContain("Asia/Ho_Chi_Minh");
    expect(def.schema.safeParse({ timezone: "Asia/Tokyo" }).success).toBe(true);
    expect(def.schema.safeParse({ timezone: "Mars/Olympus" }).success).toBe(false);
    expect(def.schema.safeParse({ timezone: "" }).success).toBe(false);
  });

  it("p4-05: pm.review (tab pm) — mặc định cho bảng mới + mốc nhắc; số lượt 1–5, 1–3 mốc tăng dần 1–168 giờ; khoá ≤ 2 đoạn để PUT /admin/system-config/:key nhận được", () => {
    const def = SYSTEM_CONFIG_REGISTRY["pm.review"]!;
    expect(def.tab).toBe("pm");
    expect(def.affects).toEqual(["runtime"]);
    const f = fieldMap("pm.review");
    expect(f.enabledForNewBoards).toMatchObject({ kind: "bool", default: false });
    expect(f.requiredReviews).toMatchObject({ kind: "int", default: 2, floor: 1, ceil: LIMITS.review.requiredMax });
    expect(f.reminderHours).toMatchObject({ kind: "json", default: [24, 72] });
    expect(def.schema.safeParse({ enabledForNewBoards: true, requiredReviews: 3, reminderHours: [12, 48, 96] }).success).toBe(true);
    expect(def.schema.safeParse({ requiredReviews: 0 }).success).toBe(false);
    expect(def.schema.safeParse({ requiredReviews: LIMITS.review.requiredMax + 1 }).success).toBe(false);
    expect(def.schema.safeParse({ reminderHours: [] }).success).toBe(false);
    expect(def.schema.safeParse({ reminderHours: [1, 2, 3, 4] }).success).toBe(false);
    expect(def.schema.safeParse({ reminderHours: [72, 24] }).success).toBe(false); // giảm dần
    expect(def.schema.safeParse({ reminderHours: [24, 24] }).success).toBe(false);
    expect(def.schema.safeParse({ reminderHours: [0, 24] }).success).toBe(false);
    expect(def.schema.safeParse({ reminderHours: [24, 169] }).success).toBe(false);
    expect(systemConfigKeyParamSchema.safeParse({ key: "pm.review" }).success).toBe(true);
  });

  it("resource.quotaOverrides (kind json): workspaceId ObjectId, bytes 0,5–100 GiB", () => {
    const def = SYSTEM_CONFIG_REGISTRY.resource!;
    expect(def.tab).toBe("storage");
    expect(def.fields[0]).toMatchObject({ path: "quotaOverrides", kind: "json", default: [] });
    const ok = { workspaceId: "66f1a2b3c4d5e6f708192a3b", bytes: 5 * 1024 * 1024 * 1024 };
    expect(def.schema.safeParse({ quotaOverrides: [ok] }).success).toBe(true);
    expect(def.schema.safeParse({ quotaOverrides: [{ ...ok, workspaceId: "khong-phai-objectid" }] }).success).toBe(false);
    expect(def.schema.safeParse({ quotaOverrides: [{ ...ok, bytes: 1024 }] }).success).toBe(false);
    expect(def.schema.safeParse({ quotaOverrides: [{ ...ok, bytes: 101 * 1024 * 1024 * 1024 }] }).success).toBe(false);
  });
});

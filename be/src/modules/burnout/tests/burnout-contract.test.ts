/**
 * Hợp đồng của p7-03: DTO (zod), registry `burnout.rules`, hằng `LIMITS.wellbeing`, mã lỗi `WELL_*` (không trùng tiền tố), loại thông báo (push TRUNG TÍNH — không lộ điểm/mức ở màn hình khoá), cổng thông báo.
 */
const mockNotify = jest.fn();
jest.mock("../../notifications/public", () => {
  const actual = jest.requireActual("../../notifications/public");
  return { ...actual, notify: (...args: unknown[]) => mockNotify(...args) };
});

import { BURNOUT_RULES_CONFIG_KEY, DEFAULT_BURNOUT_RULE_SET, burnoutRuleSetSchema } from "../../../core/constants/burnout";
import { SYSTEM_CONFIG_REGISTRY } from "../../../core/config/system-config.registry";
import { LIMITS } from "../../../core/constants/limits";
import { AVAILABLE_MODULES, MODULES } from "../../../core/constants/modules";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { getNotificationType } from "../../notifications/public";
import { ackSchema, assessmentsQuerySchema, overviewQuerySchema, updateRulesSchema, updateSettingSchema } from "../dtos";
import { dayConfigFrom } from "../domain/wellbeing-day";
import type { TxHandle } from "../repositories/tx";
import { burnoutErrors } from "../burnout.errors";
import { NotifyBurnoutNotifier } from "../services/burnout.ports";
import { BURNOUT_ALERT_PUSH_TEXT, BURNOUT_NOTIFICATION_TYPES, registerBurnoutNotificationTypes } from "../services/burnout-notification-types";

describe("updateSettingSchema — PUT /me/wellbeing", () => {
  it("`optIn` bắt buộc: không có đường nào bật/tắt mà không chủ động gửi", () => {
    expect(updateSettingSchema.safeParse({}).success).toBe(false);
    expect(updateSettingSchema.safeParse({ alertsEnabled: true }).success).toBe(false);
    expect(updateSettingSchema.safeParse({ optIn: "true" }).success).toBe(false);
    expect(updateSettingSchema.safeParse({ optIn: true }).success).toBe(true);
    expect(updateSettingSchema.safeParse({ optIn: false }).success).toBe(true);
  });

  it("trường lạ bị TỪ CHỐI (không bỏ qua âm thầm): không gửi được userId để tác động người khác", () => {
    expect(updateSettingSchema.safeParse({ optIn: true, userId: "a".repeat(24) }).success).toBe(false);
    expect(updateSettingSchema.safeParse({ optIn: true, quietHours: {} }).success).toBe(false);
  });

  it("giờ nghỉ mong muốn: làm 15–180 phút, nghỉ 1–60 phút; null xoá", () => {
    const ok = (preferredBreak: unknown) => updateSettingSchema.safeParse({ optIn: true, preferredBreak }).success;
    expect(ok({ workMinutes: 50, breakMinutes: 10 })).toBe(true);
    expect(ok({ workMinutes: 15, breakMinutes: 1 })).toBe(true);
    expect(ok({ workMinutes: 180, breakMinutes: 60 })).toBe(true);
    expect(ok(null)).toBe(true);
    for (const bad of [{ workMinutes: 14, breakMinutes: 10 }, { workMinutes: 181, breakMinutes: 10 }, { workMinutes: 50, breakMinutes: 0 }, { workMinutes: 50, breakMinutes: 61 }, { workMinutes: 50.5, breakMinutes: 10 }, { workMinutes: 50 }, { workMinutes: 50, breakMinutes: 10, extra: 1 }]) {
      expect(ok(bad)).toBe(false);
    }
  });
});

describe("query/body khác", () => {
  it("assessmentsQuerySchema: mặc định 7, chỉ nhận 7 hoặc 30 (kể cả dạng chuỗi)", () => {
    expect(assessmentsQuerySchema.parse({})).toEqual({ days: 7 });
    expect(assessmentsQuerySchema.parse({ days: "30" })).toEqual({ days: 30 });
    expect(assessmentsQuerySchema.parse({ days: 7 })).toEqual({ days: 7 });
    for (const bad of ["14", "0", "-7", "abc", "7.5"]) expect(assessmentsQuerySchema.safeParse({ days: bad }).success).toBe(false);
  });

  it("ackSchema: chỉ DISMISS | SNOOZE, không trường lạ", () => {
    expect(ackSchema.safeParse({ action: "DISMISS" }).success).toBe(true);
    expect(ackSchema.safeParse({ action: "SNOOZE" }).success).toBe(true);
    expect(ackSchema.safeParse({ action: "IGNORE" }).success).toBe(false);
    expect(ackSchema.safeParse({}).success).toBe(false);
    expect(ackSchema.safeParse({ action: "DISMISS", userId: "x" }).success).toBe(false);
  });

  it("overviewQuerySchema: weeks 1–12, mặc định 12", () => {
    expect(overviewQuerySchema.parse({})).toEqual({ weeks: 12 });
    expect(overviewQuerySchema.parse({ weeks: "4" })).toEqual({ weeks: 4 });
    for (const bad of ["0", "13", "-1", "x"]) expect(overviewQuerySchema.safeParse({ weeks: bad }).success).toBe(false);
  });
});

describe("updateRulesSchema — PUT /admin/wellbeing/rules", () => {
  const { windowDays, levels, rules } = DEFAULT_BURNOUT_RULE_SET;
  const ruleSet = { windowDays, levels, rules }; // không có `version` (máy chủ tự gán)
  const body = { ...ruleSet, expectedVersion: 1, reason: "Điều chỉnh ngưỡng theo phản hồi" };

  it("hợp lệ; `version` do máy chủ gán nên client gửi lên bị từ chối", () => {
    expect(updateRulesSchema.safeParse(body).success).toBe(true);
    expect(updateRulesSchema.safeParse({ ...body, version: 5 }).success).toBe(false);
  });

  it("lý do ≥ 10 ký tự; expectedVersion ≥ 1", () => {
    expect(updateRulesSchema.safeParse({ ...body, reason: "ngắn" }).success).toBe(false);
    expect(updateRulesSchema.safeParse({ ...body, expectedVersion: 0 }).success).toBe(false);
    expect(updateRulesSchema.safeParse({ ...ruleSet, expectedVersion: 1 }).success).toBe(false);
  });

  it("1–20 luật; metric/aggregate/op thuộc danh sách; điểm 1–100; days 1–30; ngưỡng ≥ 0; mã luật đúng khuôn; nhãn ≤ 120", () => {
    const first = DEFAULT_BURNOUT_RULE_SET.rules[0];
    const withRules = (rules: unknown[]) => updateRulesSchema.safeParse({ ...body, rules }).success;
    expect(withRules([])).toBe(false);
    expect(withRules(Array.from({ length: 21 }, (_, i) => ({ ...first, id: `r${String(i)}` })))).toBe(false);
    expect(withRules(Array.from({ length: 20 }, (_, i) => ({ ...first, id: `r${String(i)}` })))).toBe(true);
    for (const patch of [{ metric: "bedtime" }, { aggregate: "MEDIAN" }, { op: "LT" }, { points: 0 }, { points: 101 }, { points: 1.5 }, { days: 0 }, { days: 31 }, { threshold: -1 }, { threshold: Number.NaN }, { id: "Có Dấu" }, { id: "A" }, { id: "" }, { label: "x".repeat(121) }, { label: "  " }, { extra: 1 }]) {
      expect(withRules([{ ...first, ...patch }])).toBe(false);
    }
  });

  it("levels.medium 1–99, high 2–100 (quan hệ medium < high do service kiểm → WELL_004)", () => {
    expect(updateRulesSchema.safeParse({ ...body, levels: { medium: 0, high: 70 } }).success).toBe(false);
    expect(updateRulesSchema.safeParse({ ...body, levels: { medium: 40, high: 101 } }).success).toBe(false);
    expect(updateRulesSchema.safeParse({ ...body, levels: { medium: 60, high: 60 } }).success).toBe(true);
  });
});

describe("registry SystemConfig `burnout.rules`", () => {
  const def = SYSTEM_CONFIG_REGISTRY[BURNOUT_RULES_CONFIG_KEY];

  it("khoá 2 đoạn, đọc runtime nội bộ, mặc định = bộ luật theo đặc tả và qua schema", () => {
    expect(BURNOUT_RULES_CONFIG_KEY).toBe("burnout.rules");
    expect(def).toMatchObject({ key: "burnout.rules", affects: ["runtime"] });
    const defaults = Object.fromEntries((def?.fields ?? []).map((f) => [f.path, f.default]));
    expect(defaults).toEqual(DEFAULT_BURNOUT_RULE_SET);
    expect(burnoutRuleSetSchema.safeParse(defaults).success).toBe(true);
    expect(def?.fields.find((f) => f.path === "windowDays")).toMatchObject({ kind: "int", floor: 1, ceil: LIMITS.wellbeing.windowDaysMax });
  });

  it("schema registry chỉ kiểm HÌNH DẠNG và cho phép ghi từng phần (partial)", () => {
    expect(def?.schema.safeParse({ windowDays: 14 }).success).toBe(true);
    expect(def?.schema.safeParse({ windowDays: 99 }).success).toBe(false);
    expect(def?.schema.safeParse({ unknown: 1 }).success).toBe(false);
  });
});

describe("LIMITS.wellbeing + cờ + socket", () => {
  it("khung khuya/khe/ngưỡng ẩn danh khớp kế hoạch (README §7)", () => {
    const w = LIMITS.wellbeing;
    expect(w).toMatchObject({ alertCooldownHours: 24, retentionDays: 90, bucketMinutes: 15, continuousGapMinutes: 20, anonymityMin: 20, lateNight: { start: "23:00", end: "05:00" } });
    expect(dayConfigFrom(w)).toMatchObject({ lateNightStartMinute: 23 * 60, lateNightEndMinute: 5 * 60 });
    expect(w.cellMin).toBeLessThanOrEqual(w.anonymityMin);
    expect(w.minDailiesForAssessment).toBe(3);
    expect(w.assessmentDays).toEqual([7, 30]);
    expect(w.overviewMaxWeeks).toBeLessThanOrEqual(12);
    expect(60 % w.bucketMinutes).toBe(0);
  });

  it("cờ `burnout` có mã (AVAILABLE_MODULES) và có nhãn; sự kiện socket `wellbeing:alert`", () => {
    expect(AVAILABLE_MODULES).toContain(MODULES.BURNOUT);
    expect(SocketEvent.WELLBEING_ALERT).toBe("wellbeing:alert");
  });
});

describe("mã lỗi WELL_*", () => {
  const wellKeys = Object.keys(ErrorCode).filter((k) => k.startsWith("WELL_"));

  it("đúng WELL_001/003/004 (WELL_002 dành cho P1) — mỗi mã có thông điệp tiếng Việt, tiền tố không dùng chung với mã khác", () => {
    expect(wellKeys.sort()).toEqual(["WELL_001", "WELL_003", "WELL_004"]);
    for (const key of wellKeys) expect(ErrorMessages[key as keyof typeof ErrorMessages]).toBeTruthy();
    const others = Object.keys(ErrorCode).filter((k) => /^WELL/.test(k) && !k.startsWith("WELL_"));
    expect(others).toEqual([]);
  });

  it("factory: WELL_001 → 409, WELL_003 → 400 kèm issues, WELL_004 → 400; 404 chung cho id không thấy", () => {
    expect(burnoutErrors.notEnabled()).toMatchObject({ statusCode: 409, errorCode: "WELL_001" });
    expect(burnoutErrors.invalidRules([{ code: "DUPLICATE_RULE_ID", message: "x" }])).toMatchObject({ statusCode: 400, errorCode: "WELL_003", details: { issues: [{ code: "DUPLICATE_RULE_ID" }] } });
    expect(burnoutErrors.levelsOrder()).toMatchObject({ statusCode: 400, errorCode: "WELL_004" });
    expect(burnoutErrors.notFound("x")).toMatchObject({ statusCode: 404 });
  });
});

describe("loại thông báo `wellbeing.alert` — riêng tư ở màn hình khoá", () => {
  beforeEach(() => registerBurnoutNotificationTypes());

  it("hộp thư + push, đích danh, tôn trọng tắt tiếng/DND (vào hộp thư khi giờ yên lặng, không push — WELL-05)", () => {
    expect(getNotificationType(BURNOUT_NOTIFICATION_TYPES.ALERT)).toMatchObject({ inbox: true, inboxFilter: "all", androidChannel: "default", respectMute: "ALWAYS", bypassDnd: false, batchable: false, personal: true, readAction: null });
  });

  it("push TRUNG TÍNH: không nhắc sức khoẻ/kiệt sức/rủi ro/điểm/mức, kể cả khi bật xem trước màn hình khoá; dữ liệu đi kèm chỉ có assessmentId", () => {
    const def = getNotificationType(BURNOUT_NOTIFICATION_TYPES.ALERT);
    for (const lockScreenPreview of [false, true]) {
      const push = def?.push?.template?.({ refs: { assessmentId: "x", level: "HIGH", riskScore: 88 }, lockScreenPreview });
      expect(push).toEqual(BURNOUT_ALERT_PUSH_TEXT);
      expect(JSON.stringify(push)).not.toMatch(/sức khoẻ|sức khỏe|kiệt sức|burnout|wellbeing|rủi ro|điểm|mức|cao|HIGH|MEDIUM|88/i);
    }
    expect(def?.push?.dataKeys).toEqual(["assessmentId"]);
    expect(def?.push?.collapseKey?.({ assessmentId: "abc" })).toBe("wellbeing.alert:abc");
  });
});

describe("NotifyBurnoutNotifier", () => {
  beforeEach(() => mockNotify.mockResolvedValue({}));

  it("`notify()` đúng tham số: scope null, nguồn BurnoutAssessment, dedupeKey theo đánh giá, refs CHỈ có assessmentId (không mức/điểm)", async () => {
    const tx = {} as unknown as TxHandle;
    await new NotifyBurnoutNotifier().alert(tx, { userId: "u1", assessmentId: "a1" });
    expect(mockNotify).toHaveBeenCalledWith(tx, {
      type: "wellbeing.alert",
      scope: null,
      source: { type: "BurnoutAssessment", id: "a1" },
      refs: { assessmentId: "a1" },
      recipients: [{ userId: "u1" }],
      dedupeKey: "wellbeing.alert:assessment:a1",
    });
  });
});

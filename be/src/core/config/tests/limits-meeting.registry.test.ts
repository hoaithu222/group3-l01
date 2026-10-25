/**
 * Unit — khoá registry `limits.meeting` (admin.md p2-04 §2.2): đủ 8 khoá theo thứ tự bảng plan, khoảng hợp lệ đúng plan (đặc biệt sàn
 * `attendeesMax = 2`), mặc định nằm trong khoảng, `RuntimeConfigService` clamp giá trị đã lưu ngoài khoảng.
 */
import { LIMITS } from "../../constants/limits";
import { getEffective, initRuntimeConfig, resetRuntimeConfig, type ISystemConfigReader, type SystemConfigSnapshot } from "../runtime-config";
import { SYSTEM_CONFIG_REGISTRY } from "../system-config.registry";

const def = SYSTEM_CONFIG_REGISTRY["limits.meeting"]!;
const field = (path: string) => def.fields.find((f) => f.path === path)!;
const reader = (data: Record<string, SystemConfigSnapshot>): ISystemConfigReader => ({ findByKey: (key) => Promise.resolve(data[key] ?? null) });

describe("SYSTEM_CONFIG_REGISTRY['limits.meeting']", () => {
  afterEach(() => resetRuntimeConfig());

  it("đủ 8 khoá theo thứ tự bảng admin.md §2.2, nằm ở tab limits", () => {
    expect(def.tab).toBe("limits");
    expect(def.fields.map((f) => f.path)).toEqual(["titleMax", "agendaMax", "remindersMax", "attendeesMax", "joinWindowMinutes", "maxParticipants", "maxMinutes", "restartWindowMinutes"]);
  });

  it("khoảng floor/ceil khớp plan: titleMax 1–255, agendaMax ≤ 2000, remindersMax 0–3, attendeesMax 2–200, joinWindow 0–60, maxParticipants 2–50, maxMinutes 15–480, restartWindow 0–240", () => {
    expect(field("titleMax")).toMatchObject({ floor: 1, ceil: 255 });
    expect(field("agendaMax")).toMatchObject({ floor: 0, ceil: 2000 });
    expect(field("remindersMax")).toMatchObject({ floor: 0, ceil: 3 });
    expect(field("attendeesMax")).toMatchObject({ floor: 2, ceil: 200 }); // sàn 2 (trước đây 1) — chủ trì + ≥ 1 người được mời
    expect(field("joinWindowMinutes")).toMatchObject({ floor: 0, ceil: 60, unit: "min" });
    expect(field("maxParticipants")).toMatchObject({ floor: 2, ceil: 50 });
    expect(field("maxMinutes")).toMatchObject({ floor: 15, ceil: 480, unit: "min" });
    expect(field("restartWindowMinutes")).toMatchObject({ floor: 0, ceil: 240, unit: "min" });
  });

  it("mặc định = LIMITS.meeting và luôn nằm trong [floor, ceil] (không khoá nào tự bị clamp)", () => {
    for (const f of def.fields) {
      expect(f.default).toBe((LIMITS.meeting as Record<string, unknown>)[f.path]);
      const ceil = typeof f.ceil === "function" ? f.ceil() : f.ceil;
      expect(f.default as number).toBeGreaterThanOrEqual(f.floor!);
      expect(f.default as number).toBeLessThanOrEqual(ceil!);
    }
  });

  it("trần cứng của DTO (LIMITS) không thấp hơn ceil của registry — admin chỉ HẠ được, không nâng vượt DTO", () => {
    expect(LIMITS.meeting.titleMax).toBeGreaterThanOrEqual(255);
    expect(LIMITS.meeting.agendaMax).toBeGreaterThanOrEqual(2000);
    expect(LIMITS.meeting.restartWindowMinutes).toBeLessThanOrEqual(240);
  });

  it("schema PUT chấp nhận khoá mới (số nguyên) và từ chối khoá lạ / giá trị không nguyên", () => {
    expect(def.schema.safeParse({ titleMax: 100, agendaMax: 500, restartWindowMinutes: 30, attendeesMax: 2 }).success).toBe(true);
    expect(def.schema.safeParse({ titleMax: 10.5 }).success).toBe(false);
    expect(def.schema.safeParse({ titleMax: "100" }).success).toBe(false);
  });

  it("getEffective: khoá mới có mặc định; giá trị đã lưu thấp hơn sàn/cao hơn trần bị clamp âm thầm (attendeesMax 1 → 2)", async () => {
    initRuntimeConfig(reader({}));
    const dflt = await getEffective("limits.meeting");
    expect([dflt.titleMax, dflt.agendaMax, dflt.restartWindowMinutes]).toEqual([LIMITS.meeting.titleMax, LIMITS.meeting.agendaMax, LIMITS.meeting.restartWindowMinutes]);

    resetRuntimeConfig(); // xoá cache bộ nhớ của lần đọc trước (snapshot rỗng)
    initRuntimeConfig(reader({ "limits.meeting": { value: { attendeesMax: 1, titleMax: 9999, agendaMax: -5, restartWindowMinutes: 9999 }, version: 3 } }));
    const clamped = await getEffective("limits.meeting");
    expect([clamped.attendeesMax, clamped.titleMax, clamped.agendaMax, clamped.restartWindowMinutes]).toEqual([2, 255, 0, 240]);
  });
});

import { PreferenceResolver, isInDnd, isWithinQuietHours } from "../services/preference.resolver";
import type { IPreferenceReader } from "../services/preference.resolver";
import type { NotificationPreferenceEntity } from "../entities/notification.interface";

function pref(overrides: Partial<NotificationPreferenceEntity>): NotificationPreferenceEntity {
  return {
    id: "p1",
    userId: "u1",
    scope: "ACCOUNT",
    scopeKey: "account",
    mode: "INHERIT",
    mutedUntil: null,
    dndUntil: null,
    quietHours: null,
    lockScreenPreview: false,
    updatedAt: new Date(),
    ...overrides,
  };
}

class FakeReader implements IPreferenceReader {
  constructor(private readonly store: Map<string, NotificationPreferenceEntity>) {}
  async get(userId: string, scope: string, scopeKey: string) {
    return this.store.get(`${userId}:${scope}:${scopeKey}`) ?? null;
  }
}

function makeResolver(entries: NotificationPreferenceEntity[]): PreferenceResolver {
  const store = new Map<string, NotificationPreferenceEntity>();
  for (const e of entries) store.set(`${e.userId}:${e.scope}:${e.scopeKey}`, e);
  return new PreferenceResolver(new FakeReader(store));
}

describe("PreferenceResolver.resolve", () => {
  it("không có preference nào → mặc định LIMITS.notification.defaultMode (MENTIONS)", async () => {
    const resolver = makeResolver([]);
    const effective = await resolver.resolve("u1", null);
    expect(effective.mode).toBe("MENTIONS");
  });

  it("chuỗi INHERIT: CHANNEL INHERIT → WORKSPACE INHERIT → ACCOUNT ALL", async () => {
    const resolver = makeResolver([
      pref({ scope: "CHANNEL", scopeKey: "ch1", mode: "INHERIT" }),
      pref({ scope: "WORKSPACE", scopeKey: "ws1", mode: "INHERIT" }),
      pref({ scope: "ACCOUNT", scopeKey: "account", mode: "ALL" }),
    ]);
    const effective = await resolver.resolve("u1", { type: "CHANNEL", id: "ch1" }, "ws1");
    expect(effective.mode).toBe("ALL");
  });

  it("CHANNEL MUTED thắng dù WORKSPACE=ALL (cấp thấp hơn ưu tiên)", async () => {
    const resolver = makeResolver([
      pref({ scope: "CHANNEL", scopeKey: "ch1", mode: "MUTED" }),
      pref({ scope: "WORKSPACE", scopeKey: "ws1", mode: "ALL" }),
    ]);
    const effective = await resolver.resolve("u1", { type: "CHANNEL", id: "ch1" }, "ws1");
    expect(effective.mode).toBe("MUTED");
  });

  it("CONVERSATION dùng khi scope là CONVERSATION (không lẫn với CHANNEL)", async () => {
    const resolver = makeResolver([pref({ scope: "CONVERSATION", scopeKey: "conv1", mode: "MENTIONS" })]);
    const effective = await resolver.resolve("u1", { type: "CONVERSATION", id: "conv1" });
    expect(effective.mode).toBe("MENTIONS");
  });

  it("mutedUntil > now → coi như MUTED dù mode lưu là ALL", async () => {
    const resolver = makeResolver([
      pref({ scope: "ACCOUNT", scopeKey: "account", mode: "ALL", mutedUntil: new Date(Date.now() + 3600_000) }),
    ]);
    const effective = await resolver.resolve("u1", null);
    expect(effective.mode).toBe("MUTED");
  });

  it("mutedUntil đã qua → không còn MUTED, dùng mode lưu", async () => {
    const resolver = makeResolver([
      pref({ scope: "ACCOUNT", scopeKey: "account", mode: "ALL", mutedUntil: new Date(Date.now() - 1000) }),
    ]);
    const effective = await resolver.resolve("u1", null);
    expect(effective.mode).toBe("ALL");
  });

  it("dndUntil/quietHours/lockScreenPreview luôn lấy từ ACCOUNT bất kể scope nào thắng mode", async () => {
    const dndUntil = new Date(Date.now() + 1000);
    const resolver = makeResolver([
      pref({ scope: "ACCOUNT", scopeKey: "account", mode: "ALL", dndUntil, lockScreenPreview: true }),
      pref({ scope: "CHANNEL", scopeKey: "ch1", mode: "MENTIONS" }),
    ]);
    const effective = await resolver.resolve("u1", { type: "CHANNEL", id: "ch1" });
    expect(effective.mode).toBe("MENTIONS");
    expect(effective.dndUntil).toEqual(dndUntil);
    expect(effective.lockScreenPreview).toBe(true);
  });
});

describe("isWithinQuietHours", () => {
  it("cửa sổ vắt qua nửa đêm (22:00 → 07:00) — 23:30 nằm trong, 12:00 không", () => {
    const q = { tz: "UTC", start: "22:00", end: "07:00" };
    const late = new Date("2026-01-01T23:30:00.000Z");
    const noon = new Date("2026-01-01T12:00:00.000Z");
    expect(isWithinQuietHours(q, late)).toBe(true);
    expect(isWithinQuietHours(q, noon)).toBe(false);
  });

  it("cửa sổ vắt qua nửa đêm — 03:00 (sau nửa đêm, trước end) vẫn trong khoảng", () => {
    const q = { tz: "UTC", start: "22:00", end: "07:00" };
    const earlyMorning = new Date("2026-01-02T03:00:00.000Z");
    expect(isWithinQuietHours(q, earlyMorning)).toBe(true);
  });

  it("cửa sổ thường (không vắt nửa đêm) — 10:00→18:00", () => {
    const q = { tz: "UTC", start: "10:00", end: "18:00" };
    expect(isWithinQuietHours(q, new Date("2026-01-01T12:00:00.000Z"))).toBe(true);
    expect(isWithinQuietHours(q, new Date("2026-01-01T20:00:00.000Z"))).toBe(false);
  });
});

describe("isInDnd", () => {
  it("dndUntil còn hạn → true", () => {
    expect(
      isInDnd(
        { mode: "ALL", dndUntil: new Date(Date.now() + 1000), quietHours: null, lockScreenPreview: false },
        new Date()
      )
    ).toBe(true);
  });

  it("trong quietHours → true", () => {
    const now = new Date("2026-01-01T23:00:00.000Z");
    expect(
      isInDnd(
        { mode: "ALL", dndUntil: null, quietHours: { tz: "UTC", start: "22:00", end: "07:00" }, lockScreenPreview: false },
        now
      )
    ).toBe(true);
  });

  it("không dnd, không quiet hours → false", () => {
    expect(isInDnd({ mode: "ALL", dndUntil: null, quietHours: null, lockScreenPreview: false })).toBe(false);
  });
});

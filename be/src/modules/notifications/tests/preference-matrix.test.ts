import {
  normalizeMode,
  resolveEffectiveMessagePreference,
  isDndActive,
  type ResolveEffectiveInput,
} from "../services/preference-matrix";

const NOW = new Date("2026-09-19T10:00:00.000Z");
const future = new Date(NOW.getTime() + 3_600_000);
const past = new Date(NOW.getTime() - 3_600_000);

const base = (over: Partial<ResolveEffectiveInput>): ResolveEffectiveInput => ({
  scope: { scopeType: "CHANNEL" },
  now: NOW,
  ...over,
});

describe("normalizeMode", () => {
  it("gộp tên chế độ của account/kênh/hội thoại về ALL | MENTIONS | MUTED; INHERIT/null → null", () => {
    expect(normalizeMode("ALL")).toBe("ALL");
    expect(normalizeMode("ALL_MESSAGES")).toBe("ALL");
    expect(normalizeMode("MENTIONS")).toBe("MENTIONS");
    expect(normalizeMode("MENTIONS_AND_THREADS")).toBe("MENTIONS");
    expect(normalizeMode("MUTED")).toBe("MUTED");
    expect(normalizeMode("INHERIT")).toBeNull();
    expect(normalizeMode(null)).toBeNull();
    expect(normalizeMode(undefined)).toBeNull();
  });
});

describe("resolveEffectiveMessagePreference — mặc định (be.md §2: 1-1/nhóm ALL, kênh MENTIONS_AND_THREADS)", () => {
  it("DIRECT không có cài đặt → ALL", () => {
    const r = resolveEffectiveMessagePreference(base({ scope: { scopeType: "CONVERSATION", conversationKind: "DIRECT" } }));
    expect(r.mode).toBe("ALL");
  });

  it("GROUP không có cài đặt → ALL", () => {
    const r = resolveEffectiveMessagePreference(base({ scope: { scopeType: "CONVERSATION", conversationKind: "GROUP" } }));
    expect(r.mode).toBe("ALL");
  });

  it("CHANNEL không có cài đặt → MENTIONS", () => {
    expect(resolveEffectiveMessagePreference(base({})).mode).toBe("MENTIONS");
  });

  it("mặc định phụ trợ: lockScreenPreview HIDDEN, sound true, không DND", () => {
    const r = resolveEffectiveMessagePreference(base({}));
    expect(r).toMatchObject({ lockScreenPreview: "HIDDEN", sound: true, dnd: false });
  });
});

describe("resolveEffectiveMessagePreference — ACCOUNT / WORKSPACE / member", () => {
  it("DIRECT chỉ đọc account.directMode (workspace không áp cho 1-1)", () => {
    const r = resolveEffectiveMessagePreference(
      base({
        scope: { scopeType: "CONVERSATION", conversationKind: "DIRECT" },
        account: { directMode: "MUTED", groupMode: "ALL" },
        workspace: { groupMode: "ALL", channelMode: "ALL" },
      })
    );
    expect(r.mode).toBe("MUTED");
  });

  it("GROUP: workspace.groupMode ghi đè account.groupMode", () => {
    const r = resolveEffectiveMessagePreference(
      base({
        scope: { scopeType: "CONVERSATION", conversationKind: "GROUP" },
        account: { groupMode: "ALL" },
        workspace: { groupMode: "MENTIONS_AND_THREADS" },
      })
    );
    expect(r.mode).toBe("MENTIONS");
  });

  it("GROUP: workspace INHERIT (null) → dùng account.groupMode", () => {
    const r = resolveEffectiveMessagePreference(
      base({
        scope: { scopeType: "CONVERSATION", conversationKind: "GROUP" },
        account: { groupMode: "MUTED" },
        workspace: { groupMode: null },
      })
    );
    expect(r.mode).toBe("MUTED");
  });

  it("CHANNEL: workspace.channelMode ghi đè account.channelMode", () => {
    const r = resolveEffectiveMessagePreference(
      base({ account: { channelMode: "MENTIONS_AND_THREADS" }, workspace: { channelMode: "ALL" } })
    );
    expect(r.mode).toBe("ALL");
  });

  it("WorkspaceMembership.notifyMode (p1-01) áp khi NotificationPreference(WORKSPACE) chưa đặt trường", () => {
    const r = resolveEffectiveMessagePreference(
      base({ account: { channelMode: "ALL" }, workspace: { channelMode: null, membershipMode: "MUTED" } })
    );
    expect(r.mode).toBe("MUTED");
  });

  it("member override (ChannelMembership.notifyMode ALL_MESSAGES) thắng workspace/account", () => {
    const r = resolveEffectiveMessagePreference(
      base({
        account: { channelMode: "MUTED" },
        workspace: { channelMode: "MUTED" },
        member: { notifyMode: "ALL_MESSAGES" },
      })
    );
    expect(r.mode).toBe("ALL");
  });

  it("member INHERIT → kế thừa cấp trên", () => {
    const r = resolveEffectiveMessagePreference(
      base({ workspace: { channelMode: "ALL" }, member: { notifyMode: "INHERIT" } })
    );
    expect(r.mode).toBe("ALL");
  });

  it("ConversationMember.notifyMode MENTIONS → MENTIONS dù account.groupMode ALL", () => {
    const r = resolveEffectiveMessagePreference(
      base({
        scope: { scopeType: "CONVERSATION", conversationKind: "GROUP" },
        account: { groupMode: "ALL" },
        member: { notifyMode: "MENTIONS" },
      })
    );
    expect(r.mode).toBe("MENTIONS");
  });

  it("mutedUntil còn hạn → MUTED dù member.notifyMode=ALL", () => {
    const r = resolveEffectiveMessagePreference(
      base({
        scope: { scopeType: "CONVERSATION", conversationKind: "DIRECT" },
        member: { notifyMode: "ALL", mutedUntil: future },
      })
    );
    expect(r.mode).toBe("MUTED");
  });

  it("mutedUntil đã qua → không còn MUTED", () => {
    const r = resolveEffectiveMessagePreference(
      base({
        scope: { scopeType: "CONVERSATION", conversationKind: "DIRECT" },
        member: { notifyMode: "ALL", mutedUntil: past },
      })
    );
    expect(r.mode).toBe("ALL");
  });
});

describe("resolveEffectiveMessagePreference — DND, xem trước màn hình khoá, âm thanh", () => {
  it("dndUntil còn hạn → dnd=true; đã qua → false", () => {
    expect(resolveEffectiveMessagePreference(base({ account: { dndUntil: future } })).dnd).toBe(true);
    expect(resolveEffectiveMessagePreference(base({ account: { dndUntil: past } })).dnd).toBe(false);
  });

  it("quietHours vắt nửa đêm (22:00 → 07:00 UTC) — 23:30 trong, 12:00 ngoài", () => {
    const quietHours = { tz: "UTC", start: "22:00", end: "07:00" };
    expect(isDndActive({ quietHours }, new Date("2026-09-19T23:30:00.000Z"))).toBe(true);
    expect(isDndActive({ quietHours }, new Date("2026-09-19T12:00:00.000Z"))).toBe(false);
  });

  it("lockScreenPreview: level mới thắng; boolean cũ true ≙ FULL; false coi như chưa chọn (→ mặc định)", () => {
    expect(resolveEffectiveMessagePreference(base({ account: { lockScreenLevel: "SENDER" } })).lockScreenPreview).toBe("SENDER");
    expect(resolveEffectiveMessagePreference(base({ account: { lockScreenPreviewLegacy: true } })).lockScreenPreview).toBe("FULL");
    expect(resolveEffectiveMessagePreference(base({ account: { lockScreenPreviewLegacy: false } })).lockScreenPreview).toBe("HIDDEN");
    expect(
      resolveEffectiveMessagePreference(base({ account: { lockScreenLevel: "HIDDEN", lockScreenPreviewLegacy: true } })).lockScreenPreview
    ).toBe("HIDDEN");
  });

  it("sound: account.sound false ghi đè mặc định true", () => {
    expect(resolveEffectiveMessagePreference(base({ account: { sound: false } })).sound).toBe(false);
  });

  it("SystemConfig defaults do admin đổi được: directMode MUTED → DIRECT mặc định MUTED", () => {
    const r = resolveEffectiveMessagePreference(
      base({
        scope: { scopeType: "CONVERSATION", conversationKind: "DIRECT" },
        defaults: { directMode: "MUTED", groupMode: "ALL", channelMode: "MENTIONS_AND_THREADS", lockScreenPreview: "SENDER", sound: false },
      })
    );
    expect(r).toMatchObject({ mode: "MUTED", lockScreenPreview: "SENDER", sound: false });
  });
});

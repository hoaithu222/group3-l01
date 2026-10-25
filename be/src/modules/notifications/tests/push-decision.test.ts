import { decidePush, needsViewingCheck, type PushDecisionInput } from "../services/push-decision";
import type { EffectiveMessagePreference } from "../services/preference-matrix";

const pref = (over: Partial<EffectiveMessagePreference> = {}): EffectiveMessagePreference => ({
  mode: "ALL",
  dnd: false,
  lockScreenPreview: "HIDDEN",
  sound: true,
  ...over,
});

const input = (over: Partial<PushDecisionInput> = {}): PushDecisionInput => ({
  pushEnabled: true,
  pref: pref(),
  reason: "MESSAGE",
  blocked: false,
  viewing: false,
  ...over,
});

describe("decidePush (be.md §5.5)", () => {
  it("chế độ ALL, không chặn gì → gửi", () => {
    expect(decidePush(input())).toEqual({ send: true });
  });

  it("cờ push tắt → skip disabled (inbox/unread không bị ảnh hưởng ở nơi gọi — NT-06)", () => {
    expect(decidePush(input({ pushEnabled: false }))).toEqual({ send: false, reason: "disabled" });
  });

  it("NT-04: MUTED chặn cả mention", () => {
    expect(decidePush(input({ pref: pref({ mode: "MUTED" }), reason: "MENTION" }))).toEqual({ send: false, reason: "muted" });
  });

  it("MENTIONS + tin thường → skip mode; MENTIONS + mention/thread → gửi", () => {
    expect(decidePush(input({ pref: pref({ mode: "MENTIONS" }), reason: "MESSAGE" }))).toEqual({ send: false, reason: "mode" });
    expect(decidePush(input({ pref: pref({ mode: "MENTIONS" }), reason: "MENTION" }))).toEqual({ send: true });
    expect(decidePush(input({ pref: pref({ mode: "MENTIONS" }), reason: "THREAD_REPLY" }))).toEqual({ send: true });
    expect(decidePush(input({ pref: pref({ mode: "MENTIONS" }), reason: "FIRST_REPLY" }))).toEqual({ send: true });
  });

  it("NT-04: DND chặn (kể cả mention)", () => {
    expect(decidePush(input({ pref: pref({ dnd: true }), reason: "MENTION" }))).toEqual({ send: false, reason: "dnd" });
  });

  it("NT-14: người đã chặn tác giả → skip blocked", () => {
    expect(decidePush(input({ blocked: true }))).toEqual({ send: false, reason: "blocked" });
  });

  it("NT-09: đang xem đúng luồng → skip viewing", () => {
    expect(decidePush(input({ viewing: true }))).toEqual({ send: false, reason: "viewing" });
  });

  it("thứ tự kiểm: disabled > muted > mode > dnd > blocked > viewing", () => {
    const all = input({ pushEnabled: false, pref: pref({ mode: "MUTED", dnd: true }), blocked: true, viewing: true });
    expect(decidePush(all)).toMatchObject({ reason: "disabled" });
    expect(decidePush({ ...all, pushEnabled: true })).toMatchObject({ reason: "muted" });
    expect(decidePush({ ...all, pushEnabled: true, pref: pref({ mode: "MENTIONS", dnd: true }) })).toMatchObject({ reason: "mode" });
    expect(decidePush({ ...all, pushEnabled: true, pref: pref({ dnd: true }) })).toMatchObject({ reason: "dnd" });
    expect(decidePush({ ...all, pushEnabled: true, pref: pref() })).toMatchObject({ reason: "blocked" });
    expect(decidePush({ ...all, pushEnabled: true, pref: pref(), blocked: false })).toMatchObject({ reason: "viewing" });
  });

  it("needsViewingCheck chỉ true khi đã qua mọi bước rẻ hơn (tránh tra Redis thừa)", () => {
    const rest = { pushEnabled: true, pref: pref(), reason: "MESSAGE" as const, blocked: false };
    expect(needsViewingCheck(rest)).toBe(true);
    expect(needsViewingCheck({ ...rest, pref: pref({ mode: "MUTED" }) })).toBe(false);
    expect(needsViewingCheck({ ...rest, blocked: true })).toBe(false);
  });
});

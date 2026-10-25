import {
  computeOutcome,
  durationSecOf,
  evaluateEnd,
  isRealCall,
  stateAfterEnd,
  summaryStatusOf,
} from "../services/call-state.machine";
import { computeMyActions } from "../services/call-dto.mapper";
import type { CallParticipantStateValue } from "../entities/call.interface";

type P = { role: "INITIATOR" | "MEMBER"; state: CallParticipantStateValue };
const init = (state: CallParticipantStateValue): P => ({ role: "INITIATOR", state });
const member = (state: CallParticipantStateValue): P => ({ role: "MEMBER", state });
const ring = (invitedCount: number, answered = false) => ({
  status: answered ? ("ACTIVE" as const) : ("RINGING" as const),
  mode: "RING" as const,
  invitedCount,
  answeredAt: answered ? new Date() : null,
});

describe("evaluateEnd — be.md §5.7 (mọi hàng bảng)", () => {
  it("chưa ai nhận, không còn ai đổ chuông, mọi người từ chối → DECLINED", () => {
    expect(evaluateEnd(ring(1), [init("JOINING"), member("DECLINED")])).toEqual({ action: "END", reason: "DECLINED" });
  });

  it("chưa ai nhận, không còn ai đổ chuông, có người MISSED → NO_ANSWER", () => {
    expect(evaluateEnd(ring(2), [init("JOINING"), member("DECLINED"), member("MISSED")])).toEqual({ action: "END", reason: "NO_ANSWER" });
  });

  it("từ chối lẫn bận (không ai nhận) vẫn tính là DECLINED; toàn bận → NO_ANSWER (endCall(BUSY) do create quyết định)", () => {
    expect(evaluateEnd(ring(2), [init("JOINING"), member("DECLINED"), member("BUSY")])).toEqual({ action: "END", reason: "DECLINED" });
    expect(evaluateEnd(ring(2), [init("JOINING"), member("BUSY"), member("BUSY")])).toEqual({ action: "END", reason: "NO_ANSWER" });
  });

  it("còn người đang đổ chuông → chưa kết thúc", () => {
    expect(evaluateEnd(ring(2), [init("JOINING"), member("RINGING"), member("DECLINED")])).toEqual({ action: "NONE" });
    expect(evaluateEnd(ring(2), [init("JOINING"), member("INVITED"), member("DECLINED")])).toEqual({ action: "NONE" });
  });

  it("1-1 đã nhận: còn < 2 người kết nối → COMPLETED; đủ 2 người → tiếp tục", () => {
    expect(evaluateEnd(ring(1, true), [init("CONNECTED"), member("LEFT")])).toEqual({ action: "END", reason: "COMPLETED" });
    expect(evaluateEnd(ring(1, true), [init("LEFT"), member("CONNECTED")])).toEqual({ action: "END", reason: "COMPLETED" });
    expect(evaluateEnd(ring(1, true), [init("CONNECTED"), member("JOINING")])).toEqual({ action: "NONE" });
  });

  it("nhóm đã nhận: 0 kết nối + 0 đổ chuông → COMPLETED", () => {
    expect(evaluateEnd(ring(3, true), [init("LEFT"), member("LEFT"), member("MISSED"), member("DECLINED")])).toEqual({ action: "END", reason: "COMPLETED" });
  });

  it("nhóm đã nhận: đúng 1 người kết nối, không ai đổ chuông → chờ grace; còn người đổ chuông → tiếp tục", () => {
    expect(evaluateEnd(ring(3, true), [init("CONNECTED"), member("LEFT"), member("MISSED")])).toEqual({ action: "GRACE" });
    expect(evaluateEnd(ring(3, true), [init("CONNECTED"), member("LEFT"), member("RINGING")])).toEqual({ action: "NONE" });
  });

  it("nhóm đã nhận, ≥ 2 người kết nối → tiếp tục", () => {
    expect(evaluateEnd(ring(3, true), [init("CONNECTED"), member("CONNECTED"), member("RINGING")])).toEqual({ action: "NONE" });
  });

  it("ROOM hoặc đã ENDED không dùng evaluateEnd", () => {
    expect(evaluateEnd({ ...ring(1), mode: "ROOM" }, [init("LEFT")])).toEqual({ action: "NONE" });
    expect(evaluateEnd({ ...ring(1), status: "ENDED" }, [init("LEFT")])).toEqual({ action: "NONE" });
  });
});

describe("outcome theo góc nhìn từng người (be.md §2 Prisma)", () => {
  const call = { initiatorId: "A", mode: "RING" as const };
  const inputs = (userId: string, role: "INITIATOR" | "MEMBER", extra: Record<string, Date | null> = {}) => ({
    userId,
    role,
    firstJoinedAt: null as Date | null,
    respondedAt: null as Date | null,
    ...extra,
  });

  it("người gọi: chưa ai nhận → OUTGOING_UNANSWERED; huỷ → CANCELLED; đã nói chuyện → COMPLETED", () => {
    expect(computeOutcome({ ...call, answeredAt: null }, inputs("A", "INITIATOR"), "JOINING", "NO_ANSWER")).toBe("OUTGOING_UNANSWERED");
    expect(computeOutcome({ ...call, answeredAt: null }, inputs("A", "INITIATOR"), "JOINING", "CANCELLED")).toBe("CANCELLED");
    expect(computeOutcome({ ...call, answeredAt: new Date() }, inputs("A", "INITIATOR"), "CONNECTED", "COMPLETED")).toBe("COMPLETED");
  });

  it("người được gọi: bỏ lỡ/bị huỷ → MISSED; từ chối → DECLINED; bận → BUSY; đã trả lời → COMPLETED", () => {
    expect(computeOutcome({ ...call, answeredAt: null }, inputs("B", "MEMBER"), "RINGING", "NO_ANSWER")).toBe("MISSED");
    expect(computeOutcome({ ...call, answeredAt: null }, inputs("B", "MEMBER"), "INVITED", "CANCELLED")).toBe("MISSED");
    expect(computeOutcome({ ...call, answeredAt: null }, inputs("B", "MEMBER"), "DECLINED", "DECLINED")).toBe("DECLINED");
    expect(computeOutcome({ ...call, answeredAt: null }, inputs("B", "MEMBER"), "BUSY", "BUSY")).toBe("BUSY");
    expect(computeOutcome({ ...call, answeredAt: new Date() }, inputs("B", "MEMBER", { respondedAt: new Date() }), "CONNECTED", "COMPLETED")).toBe("COMPLETED");
  });

  it("stateAfterEnd: đổ chuông → MISSED, đang kết nối → LEFT, còn lại giữ nguyên", () => {
    expect(stateAfterEnd("RINGING")).toBe("MISSED");
    expect(stateAfterEnd("INVITED")).toBe("MISSED");
    expect(stateAfterEnd("JOINING")).toBe("LEFT");
    expect(stateAfterEnd("CONNECTED")).toBe("LEFT");
    expect(stateAfterEnd("DECLINED")).toBe("DECLINED");
    expect(stateAfterEnd("BUSY")).toBe("BUSY");
    expect(stateAfterEnd("REMOVED")).toBe("REMOVED");
  });
});

describe("bảng tóm tắt be.md §7", () => {
  it.each([
    ["COMPLETED", false, "COMPLETED"],
    ["HOST_ENDED", true, "COMPLETED"],
    ["NO_ANSWER", false, "NO_ANSWER"],
    ["CANCELLED", false, "CANCELLED"],
    ["DECLINED", false, "DECLINED"],
    ["BUSY", false, "BUSY"],
    ["FAILED", false, "MISSED"],
    ["REVOKED", true, "COMPLETED"],
    ["ARCHIVED", false, "MISSED"],
    ["FORCE_ENDED", true, "COMPLETED"],
  ] as const)("%s (answered=%s) → %s", (reason, answered, expected) => {
    expect(summaryStatusOf(reason, answered)).toBe(expected);
  });
});

describe("tiện ích thời gian và isRealCall", () => {
  it("durationSecOf: 0 khi chưa ai nhận; làm tròn xuống", () => {
    const now = new Date("2026-01-01T00:01:30.900Z");
    expect(durationSecOf(null, now)).toBe(0);
    expect(durationSecOf(new Date("2026-01-01T00:00:00Z"), now)).toBe(90);
  });

  it("isRealCall: ENDED không thật; RINGING quá hạn coi là mồ côi; còn người kết nối/đổ chuông là thật", () => {
    const now = new Date("2026-01-01T00:02:00Z");
    const fresh = { status: "RINGING" as const, startedAt: new Date("2026-01-01T00:01:50Z") };
    const old = { status: "RINGING" as const, startedAt: new Date("2026-01-01T00:00:00Z") };
    expect(isRealCall({ status: "ENDED", startedAt: now }, [{ state: "CONNECTED" }], now, 60_000)).toBe(false);
    expect(isRealCall(old, [{ state: "RINGING" }], now, 60_000)).toBe(false);
    expect(isRealCall(fresh, [{ state: "JOINING" }, { state: "RINGING" }], now, 60_000)).toBe(true);
    expect(isRealCall({ status: "ACTIVE", startedAt: old.startedAt }, [{ state: "LEFT" }, { state: "DECLINED" }], now, 60_000)).toBe(false);
    expect(isRealCall({ status: "ACTIVE", startedAt: old.startedAt }, [{ state: "CONNECTED" }], now, 60_000)).toBe(true);
  });
});

describe("myActions (be.md §5.12)", () => {
  const ctx = { isScopeMember: true, isScopeAdmin: false, maxParticipants: 16 };
  const call = (over: Record<string, unknown> = {}) => ({ status: "RINGING" as const, mode: "RING" as const, invitedCount: 1, initiatorId: "A", ...over });
  const p = (userId: string, state: CallParticipantStateValue, role: "INITIATOR" | "MEMBER" = "MEMBER") => ({ userId, state, role, firstJoinedAt: null });

  it("callee đang đổ chuông: trả lời/từ chối, không huỷ/kết thúc", () => {
    const a = computeMyActions(call(), [p("A", "JOINING", "INITIATOR"), p("B", "RINGING")], "B", ctx);
    expect(a).toMatchObject({ canAnswer: true, canDecline: true, canCancel: false, canLeave: false });
  });

  it("người gọi khi đang đổ chuông: chỉ huỷ được; sau khi callee vào thì không huỷ được", () => {
    const parts = [p("A", "JOINING", "INITIATOR"), p("B", "RINGING")];
    expect(computeMyActions(call(), parts, "A", ctx)).toMatchObject({ canCancel: true, canLeave: true });
    const answered = [p("A", "CONNECTED", "INITIATOR"), p("B", "JOINING")];
    expect(computeMyActions(call({ status: "ACTIVE" }), answered, "A", ctx).canCancel).toBe(false);
  });

  it("1-1: canEnd cho người đang kết nối; nhóm: chỉ người gọi hoặc OWNER/ADMIN; canInvite chỉ nhóm + CONNECTED", () => {
    const parts = [p("A", "CONNECTED", "INITIATOR"), p("B", "CONNECTED")];
    expect(computeMyActions(call({ status: "ACTIVE" }), parts, "B", ctx)).toMatchObject({ canEnd: true, canInvite: false });
    const group = call({ status: "ACTIVE", invitedCount: 3 });
    expect(computeMyActions(group, parts, "B", ctx)).toMatchObject({ canEnd: false, canInvite: true });
    expect(computeMyActions(group, parts, "B", { ...ctx, isScopeAdmin: true }).canEnd).toBe(true);
    expect(computeMyActions(group, parts, "A", ctx).canEnd).toBe(true);
  });

  it("không phải participant: canJoin theo thành viên phạm vi; đã ENDED: không hành động nào", () => {
    expect(computeMyActions(call({ status: "ACTIVE", invitedCount: 3 }), [p("A", "CONNECTED", "INITIATOR")], "C", ctx).canJoin).toBe(true);
    expect(computeMyActions(call({ status: "ACTIVE" }), [p("A", "CONNECTED", "INITIATOR")], "C", { ...ctx, isScopeMember: false }).canJoin).toBe(false);
    expect(Object.values(computeMyActions(call({ status: "ENDED" }), [p("B", "LEFT")], "B", ctx)).every((v) => v === false)).toBe(true);
  });

  it("REMOVED không được join lại; đã kết nối không join", () => {
    expect(computeMyActions(call({ status: "ACTIVE", invitedCount: 3 }), [p("B", "REMOVED")], "B", ctx).canJoin).toBe(false);
    expect(computeMyActions(call({ status: "ACTIVE", invitedCount: 3 }), [p("B", "CONNECTED")], "B", ctx).canJoin).toBe(false);
  });
});

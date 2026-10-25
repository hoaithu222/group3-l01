import { AppError } from "../../../core/exceptions";
import { InMemoryForceEndRepository, InMemoryOutbox, InMemoryTxRunner } from "../repositories/media-ops-force-end.repository.inmemory";
import { AdminMediaForceEndService, type AuditPort } from "../services/admin-media-force-end.service";

/**
 * OPC-04 (p2-07 be.md §10): meeting không LIVE → `MEET_009`; outbox + audit ghi ĐÚNG MỘT LẦN dù bấm hai lần (cùng `dedupeKey`, kể cả đua P2002); cuộc gọi của cuộc họp →
 * `ADMIN_MEDIA_002`; cuộc gọi đã kết thúc → 410 `CALL_005`; audit không chứa userId/scopeId của cuộc gọi.
 */
const ACTOR = { id: "admin-1", role: "manager" };
const REASON = "Phòng treo sau sự cố mạng";

function setup() {
  const repo = new InMemoryForceEndRepository();
  const outbox = new InMemoryOutbox(repo.keys);
  const audits: Array<Parameters<AuditPort["record"]>[0]> = [];
  const audit: AuditPort = { record: (i) => (audits.push(i), Promise.resolve()) };
  const svc = new AdminMediaForceEndService(repo, new InMemoryTxRunner(), outbox, audit, () => new Date("2026-09-26T03:00:00Z"));
  repo.meetings.set("m1", { id: "m1", title: "Họp giao ban", workspaceId: "w1", status: "LIVE", version: 7, currentCallId: "c-meet" });
  repo.connected.set("c-meet", 3);
  repo.calls.set("c1", { id: "c1", scopeType: "CONVERSATION", scopeId: "conv-secret", mode: "RING", status: "ACTIVE", workspaceId: null, peakParticipants: 2, version: 4 });
  repo.calls.set("c-room", { id: "c-room", scopeType: "CHANNEL", scopeId: "ch1", mode: "ROOM", status: "ACTIVE", workspaceId: "w1", peakParticipants: 6, version: 9 });
  return { repo, outbox, audits, svc };
}

const failure = async (p: Promise<unknown>): Promise<{ code: string; status: number; details?: unknown }> => {
  try {
    await p;
  } catch (err) {
    if (err instanceof AppError) return { code: err.errorCode, status: err.statusCode, details: err.details };
  }
  return { code: "NONE", status: 0 };
};

describe("AdminMediaForceEndService — cuộc họp", () => {
  it("LIVE → 202 accepted: MỘT hàng outbox meeting.force-end (dedupeKey theo version) + MỘT audit có lý do, actor, số người đang kết nối", async () => {
    const { outbox, audits, svc } = setup();
    await expect(svc.forceEndMeeting(ACTOR, "m1", REASON)).resolves.toEqual({ accepted: true });
    expect(outbox.events).toHaveLength(1);
    expect(outbox.events[0]).toMatchObject({
      type: "meeting.force-end",
      aggregateType: "Meeting",
      aggregateId: "m1",
      queue: "calls",
      jobName: "meeting.force-end",
      dedupeKey: "meeting.force-end:meeting:m1:v7",
      payload: { meetingId: "m1", actorId: "admin-1", callId: "c-meet", reason: REASON, requestedAt: "2026-09-26T03:00:00.000Z" },
    });
    expect(audits).toEqual([
      { actorId: "admin-1", actorRole: "manager", action: "meeting.force-end", targetType: "Meeting", targetId: "m1", workspaceId: "w1", reason: REASON, metadata: { title: "Họp giao ban", connectedCount: 3 } },
    ]);
  });

  it("bấm hai lần khi version chưa đổi → cả hai 202 nhưng chỉ MỘT outbox và MỘT audit", async () => {
    const { outbox, audits, svc } = setup();
    await svc.forceEndMeeting(ACTOR, "m1", REASON);
    await expect(svc.forceEndMeeting(ACTOR, "m1", REASON)).resolves.toEqual({ accepted: true });
    expect(outbox.events).toHaveLength(1);
    expect(audits).toHaveLength(1);
  });

  it("hai yêu cầu ĐUA nhau (cùng vượt kiểm tra tồn tại): bên thua nhận P2002 → vẫn 202, không audit lần hai", async () => {
    const { repo, outbox, audits, svc } = setup();
    repo.outboxExists = () => Promise.resolve(false); // mô phỏng cả hai cùng đọc trước khi bên kia ghi
    await Promise.all([svc.forceEndMeeting(ACTOR, "m1", REASON), svc.forceEndMeeting(ACTOR, "m1", REASON)]);
    expect(outbox.events).toHaveLength(1);
    expect(audits).toHaveLength(1);
  });

  it("version đổi (cuộc họp kết thúc rồi bắt đầu lại) → dedupeKey mới → yêu cầu mới được nhận", async () => {
    const { repo, outbox, svc } = setup();
    await svc.forceEndMeeting(ACTOR, "m1", REASON);
    repo.meetings.set("m1", { ...repo.meetings.get("m1")!, version: 9 });
    await svc.forceEndMeeting(ACTOR, "m1", REASON);
    expect(outbox.events.map((e) => e.dedupeKey)).toEqual(["meeting.force-end:meeting:m1:v7", "meeting.force-end:meeting:m1:v9"]);
  });

  it.each(["SCHEDULED", "ENDED", "CANCELLED"] as const)("cuộc họp %s (không LIVE) → 409 MEET_009, không ghi gì", async (status) => {
    const { repo, outbox, audits, svc } = setup();
    repo.meetings.set("m1", { ...repo.meetings.get("m1")!, status });
    expect(await failure(svc.forceEndMeeting(ACTOR, "m1", REASON))).toMatchObject({ code: "MEET_009", status: 409 });
    expect(outbox.events).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("không có cuộc họp → 404 MEET_001", async () => {
    const { svc } = setup();
    expect(await failure(svc.forceEndMeeting(ACTOR, "khong-co", REASON))).toMatchObject({ code: "MEET_001", status: 404 });
  });
});

describe("AdminMediaForceEndService — cuộc gọi", () => {
  it("cuộc gọi đang chạy → 202: outbox call.force-end + audit KHÔNG chứa userId/scopeId/conversationId", async () => {
    const { outbox, audits, svc } = setup();
    await expect(svc.forceEndCall(ACTOR, "c1", REASON)).resolves.toEqual({ accepted: true });
    expect(outbox.events[0]).toMatchObject({ type: "call.force-end", aggregateType: "Call", aggregateId: "c1", queue: "calls", jobName: "call.force-end", dedupeKey: "call.force-end:call:c1:v4", payload: { callId: "c1", actorId: "admin-1", reason: REASON } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: "call.force-end", targetType: "Call", targetId: "c1", reason: REASON, metadata: { scopeType: "CONVERSATION", mode: "RING", peakParticipants: 2 } });
    expect("workspaceId" in (audits[0] as object)).toBe(false); // 1-1 không thuộc workspace
    expect(JSON.stringify(audits)).not.toContain("conv-secret");
  });

  it("phòng ROOM của kênh có workspace → audit mang workspaceId", async () => {
    const { audits, svc } = setup();
    await svc.forceEndCall(ACTOR, "c-room", REASON);
    expect(audits[0]).toMatchObject({ workspaceId: "w1", metadata: { scopeType: "CHANNEL", mode: "ROOM", peakParticipants: 6 } });
  });

  it("bấm hai lần → một outbox, một audit", async () => {
    const { outbox, audits, svc } = setup();
    await svc.forceEndCall(ACTOR, "c1", REASON);
    await svc.forceEndCall(ACTOR, "c1", REASON);
    expect(outbox.events).toHaveLength(1);
    expect(audits).toHaveLength(1);
  });

  it("cuộc gọi của cuộc họp (scopeType MEETING) → 409 ADMIN_MEDIA_002 kèm meetingId, không ghi gì", async () => {
    const { repo, outbox, audits, svc } = setup();
    repo.calls.set("c-meet", { id: "c-meet", scopeType: "MEETING", scopeId: "m1", mode: "ROOM", status: "ACTIVE", workspaceId: "w1", peakParticipants: 3, version: 2 });
    expect(await failure(svc.forceEndCall(ACTOR, "c-meet", REASON))).toEqual({ code: "ADMIN_MEDIA_002", status: 409, details: { meetingId: "m1" } });
    expect(outbox.events).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("cuộc gọi đã ENDED → 410 CALL_005; không tồn tại → 404 CALL_005", async () => {
    const { repo, svc } = setup();
    repo.calls.set("c1", { ...repo.calls.get("c1")!, status: "ENDED" });
    expect(await failure(svc.forceEndCall(ACTOR, "c1", REASON))).toMatchObject({ code: "CALL_005", status: 410 });
    expect(await failure(svc.forceEndCall(ACTOR, "khong-co", REASON))).toMatchObject({ code: "CALL_005", status: 404 });
  });
});

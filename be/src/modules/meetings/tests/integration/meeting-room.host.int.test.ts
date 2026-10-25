import { installMocks, redisStore } from "./meeting-room-test-mocks";
import { buildMeetingsApp, makeApi, seedWorld, type World } from "./meetings-test-kit";
import { cleanupRoomWorld, connectClient, createMeeting, drainRoomOutbox, ensureRoomIndexes, installRoomHarness, joinMeeting, startMeeting, type RoomHarness } from "./meeting-room-test-kit";
import { prisma } from "../../../../infrastructure/database";

const app = buildMeetingsApp();
const api = makeApi(app);

describe("phòng họp — điều khiển của chủ trì (integration, Mongo memory replset, LiveKit giả)", () => {
  const worlds: World[] = [];
  let h: RoomHarness;
  let w: World;

  beforeAll(async () => {
    await ensureRoomIndexes();
  });

  beforeEach(async () => {
    installMocks();
    h = installRoomHarness();
    w = await seedWorld();
    worlds.push(w);
  });

  afterEach(async () => {
    await cleanupRoomWorld(worlds.splice(0));
    redisStore.clear();
  });

  /** Chủ trì C, đồng chủ trì B, được mời D và E (đều đã vào phòng, có mic + camera). A được mời nhưng CHƯA vào. */
  async function liveRoom(over: Record<string, unknown> = {}) {
    const m = await createMeeting(api, w, w.u.C!, { attendeeIds: [w.u.D!, w.u.E!, w.u.B!, w.u.A!], coHostIds: [w.u.B!], lobbyMode: "OFF", ...over });
    const s = await startMeeting(api, m, w.u.C!);
    const callId = s.body.data.callId as string;
    const room = s.body.data.livekitRoom as string;
    const joins: Record<string, { livekitRoom: string }> = { [w.u.C!]: s.body.data };
    for (const uid of [w.u.B!, w.u.D!, w.u.E!]) joins[uid] = (await joinMeeting(api, m.id, uid)).body.data;
    for (const [uid, j] of Object.entries(joins)) connectClient(h, j, uid, [{ sid: `mic-${uid}`, source: "MICROPHONE" }, { sid: `cam-${uid}`, source: "CAMERA" }]);
    await h.calls.reconcile.reconcile(callId);
    return { m, callId, room, joins };
  }

  const track = async (room: string, uid: string, sid: string) => (await h.media.listParticipants(room)).find((p) => p.identity === uid)!.tracks.find((t) => t.sid === sid)!;
  const hostActions = (uid: string) => h.eventsTo(uid, "call:host-action").map((e) => e.payload);
  const part = (callId: string, uid: string) => prisma.callParticipant.findFirstOrThrow({ where: { callId, userId: uid } });

  it("MR-08: chủ trì tắt mic/camera một người ở server (track bị mute, cờ mutedByHost, D nhận MUTED, audit); KHÔNG có API bật lại; đồng chủ trì không tác động lên chủ trì", async () => {
    const { m, callId, room } = await liveRoom();
    const res = await api("post", `/meetings/${m.id}/participants/${w.u.D}/mute`, w.u.C!, { source: "MICROPHONE" });
    expect(res.status).toBe(204);
    expect((await track(room, w.u.D!, `mic-${w.u.D}`)).muted).toBe(true);
    expect((await track(room, w.u.D!, `cam-${w.u.D}`)).muted).toBe(false);
    expect((await part(callId, w.u.D!)).mutedByHost).toBe(true);
    expect(hostActions(w.u.D!)).toEqual([expect.objectContaining({ type: "MUTED", source: "MICROPHONE", byUserId: w.u.C, targetUserId: w.u.D, callId })]);
    expect(await prisma.auditLog.count({ where: { action: "meeting.participant-muted", targetId: m.id } })).toBe(1);

    expect((await api("post", `/meetings/${m.id}/participants/${w.u.E}/mute`, w.u.B!, { source: "CAMERA" })).status).toBe(204); // đồng chủ trì (lịch)
    expect((await track(room, w.u.E!, `cam-${w.u.E}`)).muted).toBe(true);
    expect((await part(callId, w.u.E!)).mutedByHost).toBe(false); // chỉ mic mới ghi cờ

    const onHost = await api("post", `/meetings/${m.id}/participants/${w.u.C}/mute`, w.u.B!, { source: "MICROPHONE" });
    expect([onHost.status, onHost.body.error.code]).toEqual([403, "MEET_019"]);
    const byAttendee = await api("post", `/meetings/${m.id}/participants/${w.u.E}/mute`, w.u.D!, { source: "MICROPHONE" });
    expect([byAttendee.status, byAttendee.body.error.code]).toEqual([403, "MEET_002"]);
    expect((await api("post", `/meetings/${m.id}/participants/${w.u.C}/mute`, w.u.C!, { source: "MICROPHONE" })).status).toBe(400);
    const absent = await api("post", `/meetings/${m.id}/participants/${w.u.A}/mute`, w.u.C!, { source: "MICROPHONE" });
    expect([absent.status, absent.body.error.code]).toEqual([404, "MEET_020"]);
    expect((await api("post", `/meetings/${m.id}/participants/${w.u.D}/unmute`, w.u.C!, { source: "MICROPHONE" })).status).toBe(404); // không có "bật mic người khác"
    expect((await api("post", `/meetings/${m.id}/participants/${w.u.D}/mute`, w.u.C!, { source: "BOGUS" })).status).toBe(400);
  });

  it("tắt mic tất cả: mọi mic (trừ chủ trì/đồng chủ trì) bị mute, phát MUTED tới cả phòng call:{id}, đếm đúng; dừng chia sẻ = mute SCREEN_SHARE + nhả slot", async () => {
    const { m, callId, room } = await liveRoom();
    const all = await api("post", `/meetings/${m.id}/participants/mute-all`, w.u.C!, {});
    expect(all.body.data).toEqual({ mutedCount: 2 });
    for (const uid of [w.u.D!, w.u.E!]) expect((await track(room, uid, `mic-${uid}`)).muted).toBe(true);
    for (const uid of [w.u.C!, w.u.B!]) expect((await track(room, uid, `mic-${uid}`)).muted).toBe(false);
    expect(h.emitted.some((e) => e.target === "room" && e.to === `call:${callId}` && e.event === "call:host-action" && e.payload.all === true)).toBe(true);
    expect((await api("post", `/meetings/${m.id}/participants/mute-all`, w.u.D!, {})).body.error.code).toBe("MEET_002");

    h.media.join(room, { identity: w.u.D!, tracks: [{ sid: "share-D", source: "SCREEN_SHARE", kind: "VIDEO", muted: false }, { sid: `mic-${w.u.D}`, source: "MICROPHONE", kind: "AUDIO", muted: true }] });
    expect(await h.calls.deps.store.acquireScreen(callId, w.u.D!)).toEqual({ acquired: true });
    expect((await api("post", `/meetings/${m.id}/participants/${w.u.D}/mute`, w.u.C!, { source: "SCREEN_SHARE" })).status).toBe(204);
    expect((await track(room, w.u.D!, "share-D")).muted).toBe(true);
    expect(await h.calls.deps.store.peekScreen(callId)).toBeNull();
  });

  it("MR-06: mời ra → REMOVED, đá khỏi LiveKit, D nhận REMOVED; vào lại → 403 MEET_013 suốt phiên (canJoin=false); phiên mới (bắt đầu lại) vào được; đồng chủ trì không mời được chủ trì/đồng chủ trì khác", async () => {
    const { m, callId, room } = await liveRoom();
    const res = await api("post", `/meetings/${m.id}/participants/${w.u.D}/remove`, w.u.C!, { reason: "Làm ồn" });
    expect(res.status).toBe(204);
    expect((await part(callId, w.u.D!)).state).toBe("REMOVED");
    expect(h.media.callsOf("removeParticipant").some((c) => c.args[0] === room && c.args[1] === w.u.D)).toBe(true);
    expect(hostActions(w.u.D!)).toEqual([expect.objectContaining({ type: "REMOVED", byUserId: w.u.C, targetUserId: w.u.D })]);
    expect(await prisma.auditLog.findFirst({ where: { action: "meeting.participant-removed", targetId: m.id } })).toMatchObject({ actorId: w.u.C, metadata: expect.objectContaining({ targetUserId: w.u.D, reason: "Làm ồn", alsoRemoveAttendee: false }) });

    const back = await joinMeeting(api, m.id, w.u.D!);
    expect([back.status, back.body.error.code]).toEqual([403, "MEET_013"]);
    expect((await api("get", `/meetings/${m.id}`, w.u.D!)).body.data.myActions).toMatchObject({ canJoin: false });
    const twice = await api("post", `/meetings/${m.id}/participants/${w.u.D}/remove`, w.u.C!, {});
    expect([twice.status, twice.body.error.code]).toEqual([404, "MEET_020"]);

    const onHost = await api("post", `/meetings/${m.id}/participants/${w.u.C}/remove`, w.u.B!, {});
    expect([onHost.status, onHost.body.error.code]).toEqual([403, "MEET_019"]);
    expect((await api("post", `/meetings/${m.id}/participants/${w.u.E}/remove`, w.u.D!, {})).body.error.code).toBe("MEET_002");
    expect((await api("post", `/meetings/${m.id}/participants/${w.u.B}/remove`, w.u.C!, {})).status).toBe(204); // chủ trì mời được đồng chủ trì
    expect((await api("post", `/meetings/${m.id}/participants/${w.u.E}/remove`, w.u.B!, {})).body.error.code).toBe("MEET_002"); // B đã ra

    await api("post", `/meetings/${m.id}/end`, w.u.C!, {});
    const detail = (await api("get", `/meetings/${m.id}`, w.u.C!)).body.data as { version: number };
    const again = await startMeeting(api, { id: m.id, version: detail.version }, w.u.C!);
    expect(again.status).toBe(200);
    expect((await joinMeeting(api, m.id, w.u.D!)).body.data.state).toBe("JOINED"); // phiên mới, không còn bị chặn
  });

  it("mời ra kèm alsoRemoveAttendee → đồng thời xoá khỏi danh sách tham dự; xoá attendee/loại khỏi workspace KHI ĐANG HỌP → outbox wasLive loại khỏi phòng (MR-14)", async () => {
    const { m, callId } = await liveRoom({ visibility: "WORKSPACE" }); // WORKSPACE: người bị xoá khỏi danh sách vẫn "thấy" cuộc họp → chạm MEET_013 thay vì 404
    expect((await api("post", `/meetings/${m.id}/participants/${w.u.E}/remove`, w.u.C!, { alsoRemoveAttendee: true })).status).toBe(204);
    expect(await prisma.meetingAttendee.findFirst({ where: { meetingId: m.id, userId: w.u.E! } })).toMatchObject({ removedBy: w.u.C });
    expect((await prisma.meetingAttendee.findFirst({ where: { meetingId: m.id, userId: w.u.E! } }))!.removedAt).not.toBeNull();

    // p2-04: chủ trì xoá D khỏi danh sách — D vẫn đang trong phòng
    expect((await api("delete", `/meetings/${m.id}/attendees/${w.u.D}`, w.u.C!)).status).toBe(204);
    expect((await part(callId, w.u.D!)).state).toBe("CONNECTED");
    await drainRoomOutbox(h);
    expect((await part(callId, w.u.D!)).state).toBe("REMOVED");
    expect(hostActions(w.u.D!).some((a) => a.type === "REMOVED")).toBe(true);
    expect((await joinMeeting(api, m.id, w.u.D!)).body.error.code).toBe("MEET_013");

    // thành viên bị loại khỏi workspace (lifecycle p2-04 → bỏ khỏi danh sách) → cũng bị đá khỏi phòng
    await h.container.lifecycle.handle({ scopeType: "WORKSPACE", scopeId: w.workspaceId, userIds: [w.u.B!], reason: "REMOVED" });
    await drainRoomOutbox(h);
    expect((await part(callId, w.u.B!)).state).toBe("REMOVED");
  });

  it("MR-07: khoá phòng — người mới nhận MEET_007; người từng vào rớt mạng vào lại được trong 5 phút, quá hạn thì MEET_007; chủ trì vào được; mở khoá → vào được; khoá idempotent", async () => {
    const { m, callId } = await liveRoom();
    const lock = await api("post", `/meetings/${m.id}/lock`, w.u.C!);
    expect(lock.status).toBe(200);
    expect(lock.body.data.lockedAt).not.toBeNull();
    const again = await api("post", `/meetings/${m.id}/lock`, w.u.B!);
    expect(again.body.data).toEqual(lock.body.data); // idempotent: không tăng version
    expect((await prisma.meeting.findUnique({ where: { id: m.id } }))!.lockedAt).not.toBeNull();
    expect(h.emitted.some((e) => e.target === "room" && e.to === `meet:${m.id}` && e.event === "meeting:updated" && e.payload.lockedAt === lock.body.data.lockedAt)).toBe(true);
    expect(h.emitted.some((e) => e.target === "room" && e.to === `call:${callId}` && e.event === "meeting:updated")).toBe(true);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: m.id, type: "meeting.lock-changed" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "meeting.lock", targetId: m.id } })).toBe(1);

    const newcomer = await joinMeeting(api, m.id, w.u.A!);
    expect([newcomer.status, newcomer.body.error.code]).toEqual([403, "MEET_007"]);
    expect((await api("get", `/meetings/${m.id}/room`, w.u.C!)).body.data.lockedAt).toBe(lock.body.data.lockedAt);

    expect((await api("post", `/meetings/${m.id}/leave`, w.u.D!, {})).status).toBe(204); // rớt mạng
    h.clock.advanceMinutes(1);
    expect((await joinMeeting(api, m.id, w.u.D!)).body.data).toMatchObject({ state: "JOINED", lockedAt: lock.body.data.lockedAt });
    await api("post", `/meetings/${m.id}/leave`, w.u.D!, {});
    h.clock.advanceMinutes(6);
    expect((await joinMeeting(api, m.id, w.u.D!)).body.error.code).toBe("MEET_007");
    await api("post", `/meetings/${m.id}/leave`, w.u.B!, {});
    expect((await joinMeeting(api, m.id, w.u.B!)).body.data.state).toBe("JOINED"); // đồng chủ trì vào được phòng khoá

    expect((await api("post", `/meetings/${m.id}/unlock`, w.u.D!)).body.error.code).toBe("MEET_002");
    const unlock = await api("post", `/meetings/${m.id}/unlock`, w.u.C!);
    expect(unlock.body.data.lockedAt).toBeNull();
    expect((await joinMeeting(api, m.id, w.u.A!)).body.data.state).toBe("JOINED");
    await api("post", `/meetings/${m.id}/end`, w.u.C!, {});
    expect((await api("post", `/meetings/${m.id}/lock`, w.u.C!)).body.error.code).toBe("MEET_009");
  });

  it("cấp/thu đồng chủ trì TRONG PHIÊN: chỉ chủ trì; D thành CO_HOST (metadata LiveKit, ROLE_CHANGED) và làm được việc của chủ trì; thu lại → MEMBER; không đổi vai của chủ trì/đồng chủ trì theo lịch", async () => {
    const { m, callId, room } = await liveRoom();
    const grant = await api("post", `/meetings/${m.id}/participants/${w.u.D}/role`, w.u.C!, { role: "CO_HOST" });
    expect(grant.status).toBe(200);
    expect(grant.body.data).toMatchObject({ userId: w.u.D, role: "CO_HOST" });
    expect((await part(callId, w.u.D!)).role).toBe("CO_HOST");
    const metadata = JSON.parse((await h.media.listParticipants(room)).find((p) => p.identity === w.u.D)!.metadata) as { role: string };
    expect(metadata.role).toBe("CO_HOST");
    expect(hostActions(w.u.D!)).toEqual([expect.objectContaining({ type: "ROLE_CHANGED", role: "CO_HOST" })]);
    expect((await api("post", `/meetings/${m.id}/lock`, w.u.D!)).status).toBe(200); // vai phiên đủ để khoá phòng (dù không có trong lịch)
    expect((await api("post", `/meetings/${m.id}/unlock`, w.u.D!)).status).toBe(200);
    expect((await api("post", `/meetings/${m.id}/participants/${w.u.E}/mute`, w.u.D!, { source: "MICROPHONE" })).status).toBe(204);
    expect((await api("get", `/meetings/${m.id}/lobby`, w.u.D!)).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: "meeting.participant-role", targetId: m.id } })).toBe(1);

    const byCoHost = await api("post", `/meetings/${m.id}/participants/${w.u.E}/role`, w.u.B!, { role: "CO_HOST" });
    expect([byCoHost.status, byCoHost.body.error.code]).toEqual([403, "MEET_002"]);
    expect((await api("post", `/meetings/${m.id}/participants/${w.u.B}/role`, w.u.C!, { role: "MEMBER" })).body.error.code).toBe("MEET_019");
    expect((await api("post", `/meetings/${m.id}/participants/${w.u.A}/role`, w.u.C!, { role: "CO_HOST" })).body.error.code).toBe("MEET_020");
    expect((await api("post", `/meetings/${m.id}/participants/${w.u.D}/role`, w.u.C!, { role: "HOST" })).status).toBe(400);

    const revoke = await api("post", `/meetings/${m.id}/participants/${w.u.D}/role`, w.u.C!, { role: "MEMBER" });
    expect(revoke.body.data.role).toBe("MEMBER");
    expect((await api("post", `/meetings/${m.id}/lock`, w.u.D!)).body.error.code).toBe("MEET_002");
    expect(await prisma.auditLog.count({ where: { action: "meeting.participant-role", targetId: m.id } })).toBe(2);
  });

  it("MR-18: chủ trì rời và GIAO QUYỀN cho E → E CO_HOST phiên, phòng tiếp tục, chủ trì rời (LEFT) rồi vào lại vẫn là HOST; giao cho người không trong phòng → 404 và chủ trì chưa rời", async () => {
    const { m, callId } = await liveRoom();
    const missing = await api("post", `/meetings/${m.id}/leave`, w.u.C!, { transferControlTo: w.u.A });
    expect([missing.status, missing.body.error.code]).toEqual([404, "MEET_020"]);
    expect((await part(callId, w.u.C!)).state).not.toBe("LEFT");
    expect((await api("post", `/meetings/${m.id}/leave`, w.u.D!, { transferControlTo: w.u.E })).body.error.code).toBe("MEET_002");

    expect((await api("post", `/meetings/${m.id}/leave`, w.u.C!, { transferControlTo: w.u.E })).status).toBe(204);
    expect((await part(callId, w.u.E!)).role).toBe("CO_HOST");
    expect((await part(callId, w.u.C!)).state).toBe("LEFT");
    expect(await prisma.auditLog.count({ where: { action: "meeting.transfer-control", targetId: m.id } })).toBe(1);
    expect(hostActions(w.u.E!)).toEqual([expect.objectContaining({ type: "ROLE_CHANGED", role: "CO_HOST", byUserId: w.u.C })]);
    expect((await prisma.meeting.findUnique({ where: { id: m.id } }))!.status).toBe("LIVE");
    expect((await api("post", `/meetings/${m.id}/lock`, w.u.E!)).status).toBe(200);
    expect(h.graces).toEqual([]); // đồng chủ trì (B) vẫn trong phòng: không cần grace

    const back = await joinMeeting(api, m.id, w.u.C!);
    expect(back.body.data).toMatchObject({ state: "JOINED", role: "HOST" });
  });

  it("MR-11: người cuối cùng trong nhóm điều khiển rời → hẹn host-grace 30 s; hết grace, người được mời vào sớm nhất thành CO_HOST phiên (audit); có chủ trì trong phòng → NOOP; khách qua link không được chọn", async () => {
    const { m, callId } = await liveRoom({ lobbyMode: "OFF", visibility: "WORKSPACE" });
    // E vào phòng sớm nhất, D muộn hơn (thứ tự chọn người nhận quyền tạm)
    await prisma.callParticipant.updateMany({ where: { callId, userId: w.u.E! }, data: { firstJoinedAt: new Date(Date.now() - 20 * 60_000) } });
    await prisma.callParticipant.updateMany({ where: { callId, userId: w.u.D! }, data: { firstJoinedAt: new Date(Date.now() - 5 * 60_000) } });

    await api("post", `/meetings/${m.id}/leave`, w.u.B!, {}); // C vẫn còn: không hẹn
    expect(h.graces).toEqual([]);
    await api("post", `/meetings/${m.id}/leave`, w.u.C!, {}); // hết chủ trì/đồng chủ trì, còn D và E
    expect(h.graces).toEqual([{ meetingId: m.id, callId, delayMs: 30_000 }]);

    const run = await h.container.room.maintenance.hostGrace({ meetingId: m.id, callId });
    expect(run).toBe("GRANTED");
    expect((await part(callId, w.u.E!)).role).toBe("CO_HOST");
    expect((await part(callId, w.u.D!)).role).toBe("MEMBER");
    expect(await prisma.auditLog.findFirst({ where: { action: "meeting.host-grace", targetId: m.id } })).toMatchObject({ metadata: expect.objectContaining({ grantedTo: w.u.E, system: true }) });
    expect(await h.container.room.maintenance.hostGrace({ meetingId: m.id, callId })).toBe("NOOP"); // đã có đồng chủ trì trong phòng

    const back = await joinMeeting(api, m.id, w.u.C!); // chủ trì cũ quay lại vẫn là HOST — không ai mất quyền
    expect(back.body.data.role).toBe("HOST");
    expect((await part(callId, w.u.E!)).role).toBe("CO_HOST");
  });

  it("host-grace: chỉ khách vào qua link trong phòng → NO_CANDIDATE (không cấp quyền cho khách); phiên đã kết thúc → SKIPPED", async () => {
    const m = await createMeeting(api, w, w.u.C!, { attendeeIds: [w.u.D!], visibility: "WORKSPACE", lobbyMode: "OFF" });
    const s = await startMeeting(api, m, w.u.C!);
    const callId = s.body.data.callId as string;
    const link = await joinMeeting(api, m.id, w.u.E!); // E không trong danh sách → JOINED_VIA_LINK
    connectClient(h, link.body.data, w.u.E!);
    await api("post", `/meetings/${m.id}/leave`, w.u.C!, {});
    expect(h.graces).toEqual([{ meetingId: m.id, callId, delayMs: 30_000 }]);
    expect(await h.container.room.maintenance.hostGrace({ meetingId: m.id, callId })).toBe("NO_CANDIDATE");
    expect((await part(callId, w.u.E!)).role).toBe("MEMBER");
    await api("post", `/meetings/${m.id}/end`, w.u.C!, {}); // C đã rời nhưng vẫn là chủ trì THEO LỊCH
    expect(await h.container.room.maintenance.hostGrace({ meetingId: m.id, callId })).toBe("SKIPPED");
  });

  it("hạ tay mọi người: xoá attribute handRaisedAt của những người đang giơ tay + phát LOWER_ALL_HANDS tới cả phòng; người thường không làm được", async () => {
    const { m, callId, room } = await liveRoom();
    for (const uid of [w.u.D!, w.u.E!]) await h.media.updateParticipant(room, uid, { attributes: { handRaisedAt: "2026-09-25T10:00:00.000Z" } });
    expect((await api("post", `/meetings/${m.id}/hands/lower-all`, w.u.D!)).body.error.code).toBe("MEET_002");
    expect((await api("post", `/meetings/${m.id}/hands/lower-all`, w.u.C!)).status).toBe(204);
    for (const p of (await h.media.listParticipants(room)).filter((x) => [w.u.D, w.u.E].includes(x.identity))) expect(p.attributes.handRaisedAt).toBe("");
    expect(h.emitted.some((e) => e.target === "room" && e.to === `call:${callId}` && e.payload.type === "LOWER_ALL_HANDS")).toBe(true);
  });

  it("hạ tay MỘT người: xoá attribute của ĐÚNG người đó + HAND_LOWERED chỉ tới họ (không phát cả phòng); tay đã hạ vẫn 204 + báo lại; người thường/chính mình/người ngoài phòng bị chặn", async () => {
    const { m, callId, room } = await liveRoom();
    for (const uid of [w.u.D!, w.u.E!]) await h.media.updateParticipant(room, uid, { attributes: { handRaisedAt: "2026-09-25T10:00:00.000Z" } });
    const hand = async (uid: string) => (await h.media.listParticipants(room)).find((p) => p.identity === uid)!.attributes.handRaisedAt;

    expect((await api("post", `/meetings/${m.id}/hands/${w.u.D}/lower`, w.u.B!)).status).toBe(204); // đồng chủ trì (lịch) làm được
    expect(await hand(w.u.D!)).toBe("");
    expect(await hand(w.u.E!)).toBe("2026-09-25T10:00:00.000Z");
    expect(hostActions(w.u.D!)).toEqual([expect.objectContaining({ type: "HAND_LOWERED", byUserId: w.u.B, targetUserId: w.u.D, callId })]);
    expect(hostActions(w.u.E!)).toEqual([]);
    expect(h.emitted.some((e) => e.target === "room" && e.payload.type === "HAND_LOWERED")).toBe(false);

    // Tay đã hạ: không gọi LiveKit nữa nhưng vẫn báo — lệnh giơ tay của D có thể còn trên đường tới LiveKit.
    expect((await api("post", `/meetings/${m.id}/hands/${w.u.D}/lower`, w.u.C!)).status).toBe(204);
    expect(hostActions(w.u.D!)).toHaveLength(2);

    expect((await api("post", `/meetings/${m.id}/hands/${w.u.E}/lower`, w.u.D!)).body.error.code).toBe("MEET_002");
    expect((await api("post", `/meetings/${m.id}/hands/${w.u.C}/lower`, w.u.C!)).status).toBe(400);
    const absent = await api("post", `/meetings/${m.id}/hands/${w.u.A}/lower`, w.u.C!);
    expect([absent.status, absent.body.error.code]).toEqual([404, "MEET_020"]);
    expect((await api("post", `/meetings/${m.id}/hands/khong-phai-id/lower`, w.u.C!)).status).toBe(400);
    expect(await hand(w.u.E!)).toBe("2026-09-25T10:00:00.000Z");
  });

  it("transfer-control: người nhận thành CO_HOST phiên, người giao giữ vai; giao cho người đã là chủ trì/đồng chủ trì → no-op 204; giao cho người ngoài phòng → 404", async () => {
    const { m, callId } = await liveRoom();
    expect((await api("post", `/meetings/${m.id}/transfer-control`, w.u.C!, { toUserId: w.u.E })).status).toBe(204);
    expect((await part(callId, w.u.E!)).role).toBe("CO_HOST");
    expect((await part(callId, w.u.C!)).role).toBe("HOST");
    expect((await api("post", `/meetings/${m.id}/transfer-control`, w.u.C!, { toUserId: w.u.B })).status).toBe(204);
    expect((await part(callId, w.u.B!)).role).toBe("CO_HOST");
    expect((await api("post", `/meetings/${m.id}/transfer-control`, w.u.C!, { toUserId: w.u.A })).body.error.code).toBe("MEET_020");
    expect((await api("post", `/meetings/${m.id}/transfer-control`, w.u.D!, { toUserId: w.u.E })).body.error.code).toBe("MEET_002");
  });

  it("vai theo LỊCH đổi khi đang họp (PUT attendees/:id/role) → đồng bộ vai phiên + metadata + ROLE_CHANGED; hạ về ATTENDEE → MEMBER", async () => {
    const { m, callId, room } = await liveRoom();
    expect((await api("put", `/meetings/${m.id}/attendees/${w.u.D}/role`, w.u.C!, { role: "CO_HOST" })).status).toBe(200);
    await drainRoomOutbox(h);
    expect((await part(callId, w.u.D!)).role).toBe("CO_HOST");
    expect(JSON.parse((await h.media.listParticipants(room)).find((p) => p.identity === w.u.D)!.metadata)).toMatchObject({ role: "CO_HOST", meetingId: m.id });
    expect(hostActions(w.u.D!).at(-1)).toMatchObject({ type: "ROLE_CHANGED", role: "CO_HOST" });
    expect((await api("put", `/meetings/${m.id}/attendees/${w.u.D}/role`, w.u.C!, { role: "ATTENDEE" })).status).toBe(200);
    await drainRoomOutbox(h);
    expect((await part(callId, w.u.D!)).role).toBe("MEMBER");
  });

  it("nhóm chat họp: host tạo ngay trong phòng (idempotent), attendee thường bị từ chối; cuộc họp đã có nhóm chat trả nguyên conversationId", async () => {
    const { m } = await liveRoom({ createChatGroup: false });
    expect((await prisma.meeting.findUnique({ where: { id: m.id } }))!.conversationId).toBeNull();
    const denied = await api("post", `/meetings/${m.id}/chat-group`, w.u.D!);
    expect([denied.status, denied.body.error.code]).toEqual([403, "MEET_002"]);
    const first = await api("post", `/meetings/${m.id}/chat-group`, w.u.C!);
    expect(first.status).toBe(200);
    const conversationId = first.body.data.conversationId as string;
    expect(conversationId).toMatch(/^[a-f0-9]{24}$/);
    expect((await api("post", `/meetings/${m.id}/chat-group`, w.u.B!)).body.data.conversationId).toBe(conversationId);
    expect((await prisma.meeting.findUnique({ where: { id: m.id } }))!.conversationId).toBe(conversationId);
    const members = await prisma.conversationMember.findMany({ where: { conversationId, status: "ACTIVE" } });
    expect(members.map((x) => x.userId).sort()).toEqual([w.u.A, w.u.B, w.u.C, w.u.D, w.u.E].sort());
    expect((await api("get", `/meetings/${m.id}`, w.u.D!)).body.data.conversationId).toBe(conversationId);
  });
});

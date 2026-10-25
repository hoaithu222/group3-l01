import { installMocks, redisStore } from "./meeting-room-test-mocks";
import { buildMeetingsApp, makeApi, seedWorld, type World } from "./meetings-test-kit";
import { cleanupRoomWorld, connectClient, createMeeting, drainRoomOutbox, ensureRoomIndexes, installRoomHarness, joinMeeting, startMeeting, type RoomHarness } from "./meeting-room-test-kit";
import { prisma } from "../../../../infrastructure/database";

const app = buildMeetingsApp();
const api = makeApi(app);

describe("phòng họp — phòng chờ (lobby) (integration, Mongo memory replset)", () => {
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

  /** Cuộc họp LIVE, chủ trì C, đồng chủ trì B, được mời D, người ngoài danh sách (thành viên workspace) E — `visibility = WORKSPACE`. */
  async function liveMeeting(over: Record<string, unknown> = {}) {
    const m = await createMeeting(api, w, w.u.C!, { attendeeIds: [w.u.D!, w.u.B!], coHostIds: [w.u.B!], visibility: "WORKSPACE", ...over });
    const started = await startMeeting(api, m, w.u.C!);
    return { m, callId: started.body.data.callId as string, room: started.body.data.livekitRoom as string };
  }

  const lobbyEvents = (uid: string) => h.eventsTo(uid, "meeting:lobby").map((e) => e.payload);

  it("MR-04: NON_ATTENDEES — người ngoài danh sách vào lobby; chủ trì nhận REQUESTED (kèm số người chờ); xin lại không phát trùng; cho vào → ADMITTED → join → JOINED + attendee JOINED_VIA_LINK", async () => {
    const { m, callId } = await liveMeeting();
    await drainRoomOutbox(h); // sự kiện tạo/bắt đầu chạy TRƯỚC khi E vào (handler đọc danh sách người tham dự lúc chạy)
    const first = await joinMeeting(api, m.id, w.u.E!, { displayName: "Khách E" });
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ state: "IN_LOBBY", meetingId: m.id });
    const again = await joinMeeting(api, m.id, w.u.E!);
    expect(again.body.data).toMatchObject({ state: "IN_LOBBY", requestedAt: first.body.data.requestedAt });
    for (const host of [w.u.C!, w.u.B!]) expect(lobbyEvents(host)).toEqual([expect.objectContaining({ meetingId: m.id, state: "REQUESTED", userId: w.u.E, displayName: "Khách E", lobbyCount: 1 })]);
    expect(lobbyEvents(w.u.D!)).toEqual([]);

    const list = await api("get", `/meetings/${m.id}/lobby`, w.u.C!);
    expect(list.body.data).toEqual([{ userId: w.u.E, displayName: "Khách E", requestedAt: first.body.data.requestedAt }]);
    expect((await api("get", `/meetings/${m.id}/lobby`, w.u.D!)).body.error.code).toBe("MEET_002");
    expect((await api("get", `/meetings/${m.id}/room`, w.u.C!)).body.data.lobbyCount).toBe(1);

    const admit = await api("post", `/meetings/${m.id}/lobby/${w.u.E}/admit`, w.u.C!);
    expect(admit.body.data).toEqual({ admitted: true });
    expect(lobbyEvents(w.u.E!)).toEqual([expect.objectContaining({ state: "ADMITTED", userId: w.u.E })]);
    expect(lobbyEvents(w.u.B!).at(-1)).toMatchObject({ state: "CANCELLED", userId: w.u.E, reason: "ADMITTED", lobbyCount: 0 });

    const joined = await joinMeeting(api, m.id, w.u.E!);
    expect(joined.body.data).toMatchObject({ state: "JOINED", role: "MEMBER", callId });
    expect(await prisma.meetingAttendee.findFirst({ where: { meetingId: m.id, userId: w.u.E! } })).toMatchObject({ role: "ATTENDEE", source: "JOINED_VIA_LINK", removedAt: null, meetingStatus: "LIVE" });
    expect((await prisma.meeting.findUnique({ where: { id: m.id } }))!.attendeeCount).toBe(4);
    expect((await api("get", `/meetings/${m.id}/lobby`, w.u.C!)).body.data).toEqual([]);

    // Người vào qua link KHÔNG bị coi là "được mời": không thông báo/ICS mời, chỉ đồng bộ nhóm chat.
    await drainRoomOutbox(h);
    expect(h.notified.filter((n) => n.type === "meeting.invited" && n.recipients.some((r) => r.userId === w.u.E))).toEqual([]);
    expect(h.icsJobs.filter((j) => j.userId === w.u.E)).toEqual([]);
    const linkEvent = await prisma.outboxEvent.findFirst({ where: { aggregateId: m.id, type: "meeting.attendees-changed" }, orderBy: { createdAt: "desc" } });
    expect(linkEvent!.payload).toMatchObject({ viaLink: true, added: [{ userId: w.u.E, role: "ATTENDEE" }] });
  });

  it("từ chối → DENIED tới người xin; xin lại trong 10 phút → 403 MEET_017; hết hạn → vào lobby lại được; admit/deny người không còn chờ → false", async () => {
    const { m } = await liveMeeting();
    await joinMeeting(api, m.id, w.u.E!);
    const deny = await api("post", `/meetings/${m.id}/lobby/${w.u.E}/deny`, w.u.B!);
    expect(deny.body.data).toEqual({ denied: true });
    expect(lobbyEvents(w.u.E!)).toEqual([expect.objectContaining({ state: "DENIED" })]);
    const retry = await joinMeeting(api, m.id, w.u.E!);
    expect([retry.status, retry.body.error.code]).toEqual([403, "MEET_017"]);
    expect((await api("post", `/meetings/${m.id}/lobby/${w.u.E}/deny`, w.u.C!)).body.data).toEqual({ denied: false });
    expect((await api("post", `/meetings/${m.id}/lobby/${w.u.E}/admit`, w.u.C!)).body.data).toEqual({ admitted: false });

    h.clock.advanceMinutes(11);
    expect((await joinMeeting(api, m.id, w.u.E!)).body.data.state).toBe("IN_LOBBY");
  });

  it("MR-05: hai chủ trì cùng bấm 'Cho vào' một người → đúng MỘT lần admitted:true, không lỗi; admit-all cho vào hết những người còn chờ", async () => {
    const { m } = await liveMeeting({ attendeeIds: [w.u.D!, w.u.B!, w.u.A!] });
    await joinMeeting(api, m.id, w.u.E!);
    const [a, b] = await Promise.all([api("post", `/meetings/${m.id}/lobby/${w.u.E}/admit`, w.u.C!), api("post", `/meetings/${m.id}/lobby/${w.u.E}/admit`, w.u.B!)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body.data.admitted, b.body.data.admitted].sort()).toEqual([false, true]);
    expect(lobbyEvents(w.u.E!).filter((e) => e.state === "ADMITTED")).toHaveLength(1);

    const empty = await api("post", `/meetings/${m.id}/lobby/admit-all`, w.u.C!);
    expect(empty.body.data).toEqual({ admittedUserIds: [] });
    const outsider = await joinMeeting(api, m.id, w.u.X!); // ngoài workspace: không thấy cuộc họp
    expect(outsider.status).toBe(404);
  });

  it("lobbyMode ALL: attendee thường cũng phải chờ, chủ trì/đồng chủ trì vào thẳng; OFF: người ngoài danh sách vào thẳng (JOINED_VIA_LINK); admit-all", async () => {
    const all = await liveMeeting({ lobbyMode: "ALL" });
    expect((await joinMeeting(api, all.m.id, w.u.D!)).body.data.state).toBe("IN_LOBBY");
    expect((await joinMeeting(api, all.m.id, w.u.E!)).body.data.state).toBe("IN_LOBBY");
    expect((await joinMeeting(api, all.m.id, w.u.B!)).body.data).toMatchObject({ state: "JOINED", role: "CO_HOST" });
    const both = await api("post", `/meetings/${all.m.id}/lobby/admit-all`, w.u.B!);
    expect([...both.body.data.admittedUserIds].sort()).toEqual([w.u.D, w.u.E].sort());
    expect((await joinMeeting(api, all.m.id, w.u.D!)).body.data.state).toBe("JOINED");
    await api("post", `/meetings/${all.m.id}/end`, w.u.C!, {}); // một tài khoản chỉ ở MỘT phòng tại một thời điểm

    const off = await liveMeeting({ lobbyMode: "OFF" });
    const direct = await joinMeeting(api, off.m.id, w.u.E!);
    expect(direct.body.data).toMatchObject({ state: "JOINED", role: "MEMBER" });
    expect(await prisma.meetingAttendee.findFirst({ where: { meetingId: off.m.id, userId: w.u.E! } })).toMatchObject({ source: "JOINED_VIA_LINK" });
  });

  it("huỷ yêu cầu (DELETE /lobby/me): chủ trì nhận CANCELLED, admit sau đó → false; /leave khi đang chờ cũng huỷ; người từng ở phòng vào lại không qua lobby", async () => {
    const { m, callId } = await liveMeeting();
    await joinMeeting(api, m.id, w.u.E!);
    expect((await api("delete", `/meetings/${m.id}/lobby/me`, w.u.E!)).status).toBe(204);
    expect((await api("delete", `/meetings/${m.id}/lobby/me`, w.u.E!)).status).toBe(204);
    expect(lobbyEvents(w.u.C!).at(-1)).toMatchObject({ state: "CANCELLED", userId: w.u.E, reason: "CANCELLED", lobbyCount: 0 });
    expect((await api("post", `/meetings/${m.id}/lobby/${w.u.E}/admit`, w.u.C!)).body.data.admitted).toBe(false);

    await joinMeeting(api, m.id, w.u.E!);
    expect((await api("post", `/meetings/${m.id}/leave`, w.u.E!, {})).status).toBe(204);
    expect((await api("get", `/meetings/${m.id}/lobby`, w.u.C!)).body.data).toEqual([]);

    await joinMeeting(api, m.id, w.u.E!);
    await api("post", `/meetings/${m.id}/lobby/${w.u.E}/admit`, w.u.C!);
    const joined = await joinMeeting(api, m.id, w.u.E!);
    expect(joined.body.data.state).toBe("JOINED");
    expect(joined.body.data.callId).toBe(callId);
  });

  it("người từng ở phòng vào lại KHÔNG qua lobby trong 1 giờ kể từ lần rời cuối (lobbyMode ALL); quá hạn → xin lại", async () => {
    const { m, callId } = await liveMeeting({ lobbyMode: "ALL" });
    await joinMeeting(api, m.id, w.u.D!);
    await api("post", `/meetings/${m.id}/lobby/${w.u.D}/admit`, w.u.C!);
    const joined = await joinMeeting(api, m.id, w.u.D!);
    expect(joined.body.data.state).toBe("JOINED");
    connectClient(h, joined.body.data, w.u.D!);
    await h.calls.reconcile.reconcile(callId); // webhook participant_joined → CONNECTED + firstJoinedAt

    expect((await api("post", `/meetings/${m.id}/leave`, w.u.D!, {})).status).toBe(204);
    h.clock.advanceMinutes(30);
    expect((await joinMeeting(api, m.id, w.u.D!)).body.data.state).toBe("JOINED"); // rớt mạng/vào lại: không phải xin lại
    await api("post", `/meetings/${m.id}/leave`, w.u.D!, {});
    h.clock.advanceMinutes(61);
    expect((await joinMeeting(api, m.id, w.u.D!)).body.data.state).toBe("IN_LOBBY"); // quá 1 giờ kể từ lần rời cuối
  });

  it("kết thúc cuộc họp dọn phòng chờ; duyệt/từ chối khi cuộc họp không còn LIVE → 409 MEET_009", async () => {
    const { m } = await liveMeeting();
    await joinMeeting(api, m.id, w.u.E!);
    await api("post", `/meetings/${m.id}/end`, w.u.C!, {});
    expect(await h.roomRedis.hgetall(`meet:lobby:${m.id}`)).toEqual({});
    for (const action of ["admit", "deny"]) {
      const res = await api("post", `/meetings/${m.id}/lobby/${w.u.E}/${action}`, w.u.C!);
      expect([res.status, res.body.error.code]).toEqual([409, "MEET_009"]);
    }
    expect((await api("get", `/meetings/${m.id}/lobby`, w.u.C!)).body.data).toEqual([]);
  });
});

import { ErrorCode } from "../../../core/utils/error.codes";
import type { NormalizedLiveKitEvent } from "../../../infrastructure/media";
import type { PomodoroSessionEntity } from "../entities/pomodoro.interface";
import { makeHarness, type Harness } from "./support/pomodoro-harness";

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const command = (n: number, expectedVersion: number) => ({ commandId: uuid(n), expectedVersion });

const lk = (type: string, room: string, identity?: string): NormalizedLiveKitEvent => ({
  id: `evt-${Math.random().toString(36).slice(2)}`,
  type: type,
  roomName: room,
  createdAt: new Date().toISOString(),
  room: null,
  participant: identity ? { identity, sid: `PA_${identity.slice(-4)}`, state: "ACTIVE", joinedAt: null } : null,
  track: null,
  egress: null,
});

/** Phiên FOCUS + phòng có `host` và `guest` (guest chưa kết nối LiveKit). */
async function room(): Promise<{ h: Harness; session: PomodoroSessionEntity; callId: string; roomName: string; host: ReturnType<Harness["user"]>; guest: ReturnType<Harness["user"]>; channelId: string }> {
  const h = makeHarness();
  const channelId = h.channels.add().id;
  const host = h.user("host");
  const guest = h.user("guest");
  const started = await h.c.service.start(host, channelId, command(1, 0));
  const call = h.calls.addCall({ hostId: host.id });
  h.calls.addMember(call.id, host.id, { role: "HOST", state: "JOINING", publishPermissions: { audio: true, video: true, screen: true } });
  h.calls.addMember(call.id, guest.id, { state: "JOINING", publishPermissions: { audio: true, video: true, screen: true } });
  await h.repo.linkCall(started.sessionId as string, call.id);
  h.emitted.length = 0;
  return { h, session: (await h.repo.findById(started.sessionId as string)) as PomodoroSessionEntity, callId: call.id, roomName: call.livekitRoom, host, guest, channelId };
}

describe("hiện diện qua webhook LiveKit", () => {
  it("participant_joined: mở dòng hiện diện (idempotent), áp NGAY luật mic của phase hiện tại (FOCUS: bỏ mic + âm thanh màn hình)", async () => {
    const { h, session, roomName, guest } = await room();
    h.media.join(roomName, { identity: guest.id });
    expect(await h.c.livekit.handle(lk("participant_joined", roomName, guest.id))).toBe("PROCESSED");
    expect(await h.c.livekit.handle(lk("participant_joined", roomName, guest.id))).toBe("PROCESSED"); // webhook trùng
    const presences = await h.repo.listPresence(session.id);
    expect(presences).toHaveLength(1);
    expect(presences[0]).toMatchObject({ userId: guest.id, leftAt: null, interruptions: 0 });

    const updates = h.media.callsOf("updateParticipant").filter((c) => (c.args)[1] === guest.id);
    expect(updates.length).toBeGreaterThan(0);
    expect((updates.at(-1)?.args as unknown[])[2]).toMatchObject({ permission: { canPublish: true, canPublishSources: ["CAMERA", "SCREEN_SHARE"] } });
    expect((await h.calls.findParticipant(session.callId as string, guest.id))?.publishPermissions).toEqual({ audio: false, video: true, screen: true });
  });

  it("participant_left: chốt leftAt + cộng presentSeconds; vào lại → +1 gián đoạn, mở lại dòng", async () => {
    const { h, session, roomName, guest } = await room();
    await h.c.livekit.handle(lk("participant_joined", roomName, guest.id));
    h.clock.advanceMinutes(12);
    h.media.join(roomName, { identity: newHost(h) }); // giữ phòng không rỗng
    await h.c.livekit.handle(lk("participant_left", roomName, guest.id));
    let row = await h.repo.findPresence(session.id, guest.id);
    expect(row).toMatchObject({ presentSeconds: 12 * 60, interruptions: 0 });
    expect(row?.leftAt).not.toBeNull();
    await h.c.livekit.handle(lk("participant_left", roomName, guest.id)); // trùng: không cộng lần hai
    expect((await h.repo.findPresence(session.id, guest.id))?.presentSeconds).toBe(12 * 60);

    h.clock.advanceMinutes(3);
    await h.c.livekit.handle(lk("participant_joined", roomName, guest.id));
    row = await h.repo.findPresence(session.id, guest.id);
    expect(row).toMatchObject({ leftAt: null, interruptions: 1 });
    h.clock.advanceMinutes(5);
    await h.c.livekit.handle(lk("participant_left", roomName, guest.id));
    expect((await h.repo.findPresence(session.id, guest.id))?.presentSeconds).toBe(17 * 60);
  });

  it("chủ phiên rời → hẹn đồng bộ chủ phòng sau hostGraceSeconds + 5 giây (theo failover 30 s của calls)", async () => {
    const { h, session, roomName, host } = await room();
    await h.c.livekit.handle(lk("participant_joined", roomName, host.id));
    await h.c.livekit.handle(lk("participant_left", roomName, host.id));
    expect(h.jobs.hostSyncs).toEqual([{ sessionId: session.id, delayMs: 35_000 }]);
  });

  it("phòng KHÔNG thuộc phiên Pomodoro nào (phòng thoại thường) và phòng họp → IGNORED; sự kiện không quan tâm → IGNORED", async () => {
    const { h, guest } = await room();
    expect(await h.c.livekit.handle(lk("participant_joined", "call_" + "a".repeat(24), guest.id))).toBe("IGNORED");
    expect(await h.c.livekit.handle(lk("participant_joined", "meet_abcdefghij", guest.id))).toBe("IGNORED");
    expect(await h.c.livekit.handle(lk("track_published", "call_" + "a".repeat(24), guest.id))).toBe("IGNORED");
  });

  it("người cuối rời → PAUSED EMPTY_ROOM qua webhook; room_finished trùng không đổi thêm", async () => {
    const { h, session, roomName, host } = await room();
    h.media.join(roomName, { identity: host.id });
    await h.c.livekit.handle(lk("participant_joined", roomName, host.id));
    h.media.leave(roomName, host.id);
    h.calls.members.set(session.callId as string, []);
    await h.c.livekit.handle(lk("participant_left", roomName, host.id));
    expect(await h.repo.findById(session.id)).toMatchObject({ phase: "PAUSED", pauseReason: "EMPTY_ROOM" });
    const v = (await h.repo.findById(session.id))?.version;
    await h.c.livekit.handle(lk("room_finished", roomName));
    expect((await h.repo.findById(session.id))?.version).toBe(v);
  });

  it("người vào lại khi đang đếm phòng rỗng → huỷ đếm (participant_joined → PAUSED HOST)", async () => {
    const { h, session, roomName, host } = await room();
    h.calls.members.set(session.callId as string, []);
    await h.c.runner.onMaybeEmpty(session.id);
    expect((await h.repo.findById(session.id))?.pauseReason).toBe("EMPTY_ROOM");
    h.calls.addMember(session.callId as string, host.id, { role: "HOST" });
    h.media.join(roomName, { identity: host.id });
    await h.c.livekit.handle(lk("participant_joined", roomName, host.id));
    expect(await h.repo.findById(session.id)).toMatchObject({ phase: "PAUSED", pauseReason: "HOST" });
  });
});

function newHost(h: Harness): string {
  return h.user("keeper").id;
}

describe("đồng bộ luật mic theo phase (PM-02/PM-06 phía API)", () => {
  it("FOCUS → nghỉ: trả lại MICROPHONE cho mọi người (quyền LƯU + LiveKit), KHÔNG bật mic hộ; nghỉ → FOCUS: thu lại", async () => {
    const { h, session, callId, roomName, host, guest } = await room();
    for (const u of [host, guest]) {
      h.media.join(roomName, { identity: u.id, tracks: [{ sid: `TR_${u.id.slice(-4)}`, source: "MICROPHONE", kind: "AUDIO", muted: true }] });
      h.calls.addMember(callId, u.id, { state: "CONNECTED", role: u.id === host.id ? "HOST" : "MEMBER", publishPermissions: { audio: false, video: true, screen: true } });
    }
    h.media.reset();
    h.media.join(roomName, { identity: host.id });
    h.media.join(roomName, { identity: guest.id });

    h.clock.advanceMinutes(25);
    await h.c.runner.onDeadline({ sessionId: session.id, version: session.version, phase: "FOCUS" });
    const breakUpdates = h.media.callsOf("updateParticipant");
    expect(breakUpdates).toHaveLength(2);
    for (const call of breakUpdates) {
      expect((call.args)[2]).toMatchObject({ permission: { canPublish: true, canPublishSources: ["MICROPHONE", "CAMERA", "SCREEN_SHARE", "SCREEN_SHARE_AUDIO"] } });
    }
    expect((await h.calls.findParticipant(callId, guest.id))?.publishPermissions.audio).toBe(true);
    // Quyền chỉ để CÓ THỂ bật mic — không track nào bị unmute hộ.
    expect(h.media.callsOf("mutePublishedTrack")).toHaveLength(0);

    h.media.calls.length = 0;
    h.clock.advanceMinutes(5);
    const cur = (await h.repo.findById(session.id)) as PomodoroSessionEntity;
    await h.c.runner.onDeadline({ sessionId: cur.id, version: cur.version, phase: "SHORT_BREAK" });
    const focusUpdates = h.media.callsOf("updateParticipant");
    expect(focusUpdates).toHaveLength(2);
    expect(focusUpdates[0]?.args[2]).toMatchObject({ permission: { canPublish: true, canPublishSources: ["CAMERA", "SCREEN_SHARE"] } });
    expect((await h.calls.findParticipant(callId, host.id))?.publishPermissions.audio).toBe(false);
  });

  it("⛔ chỉ còn nguồn bị khoá trong FOCUS (lõi chỉ cấp MICROPHONE) ⇒ canPublish = false, không phải danh sách rỗng với canPublish true", async () => {
    const { h, session, callId, roomName, guest } = await room();
    h.calls.addMember(callId, guest.id, { state: "CONNECTED" });
    h.calls.baseSources = () => ["MICROPHONE"]; // giả lập lõi chỉ cấp mic cho người này
    h.media.join(roomName, { identity: guest.id });
    await h.c.media.syncAll(session.id);
    const last = h.media.callsOf("updateParticipant").at(-1);
    expect((last?.args as unknown[])[2]).toMatchObject({ permission: { canPublish: false, canPublishSources: [] } });
  });

  it("người chưa kết nối LiveKit (JOINING) không làm sync thất bại; lỗi LiveKit thật → failed > 0 và job ném lỗi để BullMQ thử lại", async () => {
    const { h, session, roomName, host } = await room();
    // host + guest đang JOINING, không ai trong LiveKit → MEDIA_004 bị bỏ qua
    expect(await h.c.media.syncAll(session.id)).toEqual({ applied: 0, failed: 0 });

    h.media.join(roomName, { identity: host.id });
    h.media.failNext("updateParticipant");
    const r = await h.c.media.syncAll(session.id);
    expect(r.failed).toBe(1);
    h.media.failNext("updateParticipant");
    await expect(h.c.runner.onMediaSync(session.id)).rejects.toThrow(/Chưa áp được/);
    await expect(h.c.runner.onMediaSync(session.id)).resolves.toBeUndefined(); // lần sau không lỗi
  });

  it("chủ phòng được miễn khoá mic (hostCanSpeakInFocus, P1): host giữ MICROPHONE trong FOCUS, người khác thì không", async () => {
    const { h, session, callId, roomName, host, guest } = await room();
    await h.repo.updateSession(undefined, session.id, { version: session.version }, { config: { ...session.config, hostCanSpeakInFocus: true } });
    for (const u of [host, guest]) {
      h.media.join(roomName, { identity: u.id });
      h.calls.addMember(callId, u.id, { state: "CONNECTED", role: u.id === host.id ? "HOST" : "MEMBER" });
    }
    await h.c.media.syncAll(session.id);
    const byUser = (id: string) => (h.media.callsOf("updateParticipant").filter((c) => (c.args)[1] === id).at(-1)?.args as unknown[])[2] as { permission: { canPublishSources: string[] } };
    expect(byUser(host.id).permission.canPublishSources).toContain("MICROPHONE");
    expect(byUser(guest.id).permission.canPublishSources).not.toContain("MICROPHONE");
  });
});

describe("mục tiêu cá nhân", () => {
  it("chưa vào phòng → 409 CALL_POMO_006; đã vào: lưu riêng tư (không phát), chia sẻ → phát snapshot chung có mục tiêu", async () => {
    const { h, callId, channelId, guest, host, roomName } = await room();
    await expect(h.c.presence.setGoal(h.user("stranger"), channelId, { text: "x", shared: false })).rejects.toMatchObject({ errorCode: ErrorCode.CALL_POMO_006, statusCode: 409 });

    h.calls.addMember(callId, guest.id, { state: "CONNECTED" });
    h.calls.addMember(callId, host.id, { state: "CONNECTED", role: "HOST" });
    h.media.join(roomName, { identity: guest.id });
    const priv = await h.c.presence.setGoal(guest, channelId, { text: "Ôn chương 3", shared: false });
    expect(priv).toEqual({ goal: "Ôn chương 3", shared: false });
    expect(h.emitted.filter((e) => e.event === "pomodoro:updated")).toHaveLength(0); // riêng tư: không lộ ra phòng

    const shared = await h.c.presence.setGoal(guest, channelId, { text: "Ôn chương 3", shared: true });
    expect(shared).toEqual({ goal: "Ôn chương 3", shared: true });
    const emitted = h.emitted.filter((e) => e.event === "pomodoro:updated");
    expect(emitted).toHaveLength(1);
    expect((emitted[0]?.payload.participants as Array<{ userId: string; goal?: string }>).find((p) => p.userId === guest.id)?.goal).toBe("Ôn chương 3");
    expect(emitted[0]?.payload).not.toHaveProperty("myGoal");

    // Đổi văn bản chia sẻ → phát lại; lưu lại đúng giá trị cũ → không phát thừa.
    await h.c.presence.setGoal(guest, channelId, { text: "Ôn chương 4", shared: true });
    await h.c.presence.setGoal(guest, channelId, { text: "Ôn chương 4", shared: true });
    expect(h.emitted.filter((e) => e.event === "pomodoro:updated")).toHaveLength(2);
    // Bỏ chia sẻ → phát để người khác không còn thấy.
    await h.c.presence.setGoal(guest, channelId, { text: "Ôn chương 4", shared: false });
    expect(h.emitted.filter((e) => e.event === "pomodoro:updated")).toHaveLength(3);
    const last = h.emitted.at(-1)?.payload.participants as Array<{ userId: string; goal?: string }>;
    expect(last.find((p) => p.userId === guest.id)).not.toHaveProperty("goal");
  });

  it("mục tiêu KHÔNG bump version (lệnh của chủ phòng không bị vô hiệu vì việc của người khác); chuỗi rỗng = xoá; REST chỉ trả mục tiêu riêng của mình", async () => {
    const { h, session, callId, channelId, guest, host } = await room();
    h.calls.addMember(callId, guest.id, { state: "CONNECTED" });
    h.calls.addMember(callId, host.id, { state: "CONNECTED", role: "HOST" });
    await h.c.presence.setGoal(guest, channelId, { text: "bí mật", shared: false });
    await h.c.presence.setGoal(host, channelId, { text: "công khai", shared: true });
    expect((await h.repo.findById(session.id))?.version).toBe(session.version);

    const asGuest = await h.c.service.getSnapshot(guest, channelId);
    expect(asGuest.myGoal).toEqual({ text: "bí mật", shared: false });
    expect(asGuest.participants.find((p) => p.userId === host.id)?.goal).toBe("công khai");
    const asHost = await h.c.service.getSnapshot(host, channelId);
    expect(asHost.participants.find((p) => p.userId === guest.id)).not.toHaveProperty("goal"); // riêng tư của guest không lộ cho host

    expect(await h.c.presence.setGoal(guest, channelId, { text: "", shared: true })).toEqual({ goal: "", shared: false });
    expect((await h.c.service.getSnapshot(guest, channelId)).myGoal).toBeNull();
  });
});

describe("kết quả phiên & lịch sử cá nhân", () => {
  it("sessionResult: vòng hoàn thành của phiên + số liệu của RIÊNG người xem (presentSeconds cộng cả đoạn còn mở)", async () => {
    const { h, session, roomName, channelId, guest } = await room();
    await h.c.livekit.handle(lk("participant_joined", roomName, guest.id));
    h.clock.advanceMinutes(7);
    const r = await h.c.presence.sessionResult(guest, channelId, session.id);
    expect(r).toMatchObject({ session: { sessionId: session.id, completedFocusCycles: 0, endReason: null }, mine: { presentSeconds: 7 * 60, cyclesAttended: 0, interruptions: 0 } });
    expect((await h.c.presence.sessionResult(h.user("khac"), channelId, session.id)).mine).toBeNull(); // người chưa từng vào: không có số liệu
    await expect(h.c.presence.sessionResult(guest, h.channels.add().id, session.id)).rejects.toMatchObject({ statusCode: 404 }); // phiên của kênh khác
  });

  it("kết thúc phiên chốt hiện diện còn mở; lịch sử: mới → cũ, phân trang cursor, kèm tên kênh", async () => {
    const { h, session, roomName, channelId, host, guest } = await room();
    await h.c.livekit.handle(lk("participant_joined", roomName, guest.id));
    h.clock.advanceMinutes(20);
    await h.c.service.end(host, channelId, command(9, session.version));
    const row = await h.repo.findPresence(session.id, guest.id);
    expect(row?.leftAt).not.toBeNull();
    expect(row?.presentSeconds).toBe(20 * 60);

    const second = h.channels.add({ name: "Phòng Toán" });
    const s2 = await h.c.service.start(host, second.id, command(10, 0));
    h.clock.advanceMinutes(30);
    await h.repo.markJoined(s2.sessionId as string, guest.id, h.clock.now());

    const page1 = await h.c.presence.history(guest, { limit: 1 });
    expect(page1.items).toHaveLength(1);
    expect(page1.items[0]).toMatchObject({ sessionId: s2.sessionId, channelName: "Phòng Toán", status: "FOCUS" });
    expect(page1.hasMore).toBe(true);
    const page2 = await h.c.presence.history(guest, { limit: 1, cursor: page1.nextCursor as string });
    expect(page2.items[0]).toMatchObject({ sessionId: session.id, status: "ENDED", endReason: "HOST_ENDED", presentSeconds: 20 * 60 });
    expect(page2.hasMore).toBe(false);
    expect((await h.c.presence.history(h.user("khac"), { limit: 10 })).items).toEqual([]);
  });
});


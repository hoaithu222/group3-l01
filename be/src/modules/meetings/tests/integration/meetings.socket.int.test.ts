import { installMocks, redisStore } from "./meetings-test-mocks";
import type { Socket as ClientSocket } from "socket.io-client";
import { buildMeetingsApp, cleanupWorld, drainMeetingOutbox, ensureMeetingIndexes, idemKey, installHarness, makeApi, meetingBody, seedWorld, tokenFor, type MeetingsHarness, type World } from "./meetings-test-kit";
import { emitToRoom, emitToUsers, leaveRooms } from "../../../../infrastructure/socket/socket.emit";
import { connectClient, emitWithAck, startHarness, stopHarness, type Harness } from "../../../../infrastructure/socket/tests/integration/test-helpers";

const app = buildMeetingsApp();
const api = makeApi(app);

/** Chờ tới khi `cond()` đúng (mặc định 2 s) — sự kiện socket đến bất đồng bộ. */
async function waitFor(cond: () => boolean, ms = 2000): Promise<void> {
  const until = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > until) throw new Error("waitFor: quá hạn");
    await new Promise((r) => setTimeout(r, 15));
  }
}
const settle = (ms = 200): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface Inbox {
  invited: Array<Record<string, unknown>>;
  updated: Array<Record<string, unknown>>;
  removed: Array<Record<string, unknown>>;
}
function listen(socket: ClientSocket): Inbox {
  const box: Inbox = { invited: [], updated: [], removed: [] };
  socket.on("meeting:invited", (p: Record<string, unknown>) => box.invited.push(p));
  socket.on("meeting:updated", (p: Record<string, unknown>) => box.updated.push(p));
  socket.on("meeting:attendee-removed", (p: Record<string, unknown>) => box.removed.push(p));
  return box;
}

describe("meetings — socket thật (socket.io-client): meeting:invited chỉ tới người được mời; người bị xoá bị socketsLeave (be.md §10, MT-09)", () => {
  const worlds: World[] = [];
  let socketHarness: Harness;
  let h: MeetingsHarness;
  let w: World;
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    await ensureMeetingIndexes();
    socketHarness = await startHarness();
  });

  afterAll(async () => {
    await stopHarness(socketHarness);
  });

  beforeEach(async () => {
    installMocks();
    // Emitter THẬT (Socket.IO server ở `socketHarness`) thay cho emitter ghi lại của kit — phần còn lại (nhắc/ICS/mail) vẫn giả.
    h = installHarness({ emitter: { toUsers: emitToUsers, toRoom: (room, event, payload) => emitToRoom(room, event, payload), leaveRooms } });
    w = await seedWorld();
    worlds.push(w);
  });

  afterEach(async () => {
    for (const c of clients.splice(0)) c.disconnect();
    await cleanupWorld(worlds.splice(0));
    redisStore.clear();
  });

  const connect = async (userId: string): Promise<{ socket: ClientSocket; box: Inbox }> => {
    const socket = await connectClient(socketHarness.port, { token: tokenFor(userId) });
    clients.push(socket);
    return { socket, box: listen(socket) };
  };
  const created = async (over: Record<string, unknown>) => {
    const res = await api("post", `/workspaces/${w.workspaceId}/meetings`, w.u.C!, meetingBody(over), idemKey());
    expect(res.status).toBe(201);
    return res.body.data as { id: string };
  };

  it("meeting:invited tới ĐÚNG người được mời (không tới chủ trì, thành viên khác, người ngoài); người bị xoá rời room meet:{id} và mất quyền vào lại", async () => {
    const [host, invited, member, outsider] = await Promise.all([connect(w.u.C!), connect(w.u.D!), connect(w.u.E!), connect(w.u.X!)]);
    const m = await created({ attendeeIds: [w.u.D!], title: "Họp socket" });
    await drainMeetingOutbox(h);

    await waitFor(() => invited.box.invited.length === 1);
    await settle();
    expect(invited.box.invited[0]).toMatchObject({ meetingId: m.id, workspaceId: w.workspaceId, title: "Họp socket", hostId: w.u.C, role: "ATTENDEE", v: 1 });
    for (const other of [host, member, outsider]) expect(other.box.invited).toHaveLength(0);

    // Vào room `meet:{id}`: người tham dự được, thành viên workspace không được mời (visibility ATTENDEES) bị từ chối.
    expect(await emitWithAck(invited.socket, "room:join", { kind: "meet", id: m.id })).toEqual({ ok: true });
    expect(await emitWithAck(host.socket, "room:join", { kind: "meet", id: m.id })).toEqual({ ok: true });
    expect(await emitWithAck(member.socket, "room:join", { kind: "meet", id: m.id })).toEqual({ ok: false, code: "PERM_404" });

    // Đang ở trong room: nhận sự kiện phát tới room; người chưa vào room thì không.
    emitToRoom(`meet:${m.id}`, "meeting:updated", { meetingId: m.id, marker: "trước-khi-xoá" });
    await waitFor(() => invited.box.updated.some((e) => e.marker === "trước-khi-xoá"));
    await settle();
    expect(host.box.updated.some((e) => e.marker === "trước-khi-xoá")).toBe(true);
    expect(member.box.updated.some((e) => e.marker === "trước-khi-xoá")).toBe(false);

    // Chủ trì xoá D → handler outbox: socket meeting:attendee-removed + socketsLeave khỏi room.
    expect((await api("delete", `/meetings/${m.id}/attendees/${w.u.D}`, w.u.C!)).status).toBe(204);
    await drainMeetingOutbox(h);
    await waitFor(() => invited.box.removed.length > 0);
    expect(invited.box.removed[0]).toMatchObject({ meetingId: m.id, userId: w.u.D });
    await settle();
    expect(host.box.removed.some((e) => e.userId === w.u.D)).toBe(true); // chủ trì còn trong room nên thấy
    expect(member.box.removed).toHaveLength(0);

    // Sau socketsLeave: phát tới room KHÔNG còn tới D; chủ trì vẫn nhận.
    emitToRoom(`meet:${m.id}`, "meeting:updated", { meetingId: m.id, marker: "sau-khi-xoá" });
    await waitFor(() => host.box.updated.some((e) => e.marker === "sau-khi-xoá"));
    await settle();
    expect(invited.box.updated.some((e) => e.marker === "sau-khi-xoá")).toBe(false);
    // Vào lại room: mất quyền xem (attendee đã bị xoá ⇒ 404 trung tính).
    expect(await emitWithAck(invited.socket, "room:join", { kind: "meet", id: m.id })).toEqual({ ok: false, code: "PERM_404" });
  });
});

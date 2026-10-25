/**
 * Integration — phạm vi KHÁCH (be.md p3-04 §5.1/§5.4/§5.6, README §8 RB-01..05), Mongo memory replset (`TEST_DB=memory`) + Socket.IO THẬT:
 *   - RB-01: khách liệt kê/tìm/đọc kênh, `room:join ch|ws` — chỉ kênh CHỈ ĐỊNH (grant DIRECT, kể cả kênh public); còn lại 404/từ chối;
 *   - RB-02: danh bạ thành viên 404, mentionables chỉ người cùng phạm vi, tổng quan/chi tiết nhóm không lộ `memberCount`/chính sách;
 *   - RB-03: khách nhắn 1-1 người KHÔNG chung kênh chỉ định → 403 CONV_014 trung tính; sau khi chung kênh → được; khách không tạo nhóm chat;
 *     thêm khách vào nhóm chat khi `allowGuests=false` → 403 CONV_015;
 *   - RB-04: khách hết hạn khi đang mở kênh trên 2 thiết bị → cả hai nhận `permission:revoked` (reason EXPIRED), bị đá khỏi `ch:`, API 404;
 *     quá hạn nhưng job chưa chạy → 404 NGAY (không chờ job); cron quét bù; thông báo trước hạn idempotent;
 *   - RB-05: gia hạn → `expiryVersion` tăng, job version CŨ chạy không làm gì; PATCH đổi kênh (CH_013, 409 RES_003);
 *   - admin: `access-summary`, `invitations` (email che), `members?role=GUEST` kèm `expiresAt`.
 * Processor job bắt qua `registerJob` (mock) rồi gọi tay — không cần BullMQ/Redis thật.
 */
import { installMocks, processor, redisStore } from "./access-test-mocks";
import { buildAccessApp, expectNoLeak, makeKit, newFixture, snapshotCounts, tokenFor } from "./access-test-kit";
import { randomUUID } from "crypto";
import request from "supertest";
import type { Socket as ClientSocket } from "socket.io-client";
import { prisma } from "../../../../infrastructure/database";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { ROOM } from "../../../../infrastructure/socket";
import {
  startHarness,
  stopHarness,
  connectClient,
  tokenFor as socketTokenFor,
  emitWithAck,
  type Harness,
} from "../../../../infrastructure/socket/tests/integration/test-helpers";
// Side-effect: đăng ký processor vào `mockRegistered`.
import "../../jobs/guest-expiry.jobs";
import "../../jobs/membership-revoked.consumer";
import "../../../channels/jobs/membership-revoked.consumer";

jest.setTimeout(120_000);

const app = buildAccessApp();
const fx = newFixture();
const kit = makeKit(app, fx);
const { auth } = kit;

interface Ack {
  ok: boolean;
  code?: string;
}

describe("phạm vi KHÁCH (p3-04 RB-01..05, §5.6) — integration", () => {
  let harness: Harness;
  let baseline: number[] = [];
  const sockets: ClientSocket[] = [];

  beforeAll(async () => {
    baseline = await snapshotCounts();
    harness = await startHarness();
    bindPermissionPorts();
  });
  afterAll(async () => {
    await expectNoLeak(baseline); // dọn sạch OutboxEvent/Notification do suite tạo
    await stopHarness(harness);
    resetPermissionPorts();
  });
  beforeEach(() => installMocks());
  afterEach(async () => {
    for (const s of sockets.splice(0)) s.disconnect();
    await kit.cleanup();
    redisStore.clear();
  });

  /** Nhóm có: kênh mặc định, pubA (khách được chỉ định), pubB (không), privP (khách được chỉ định), privQ (không); 2 thành viên. */
  async function scenario() {
    const owner = await kit.seedUser("Chủ nhóm");
    const { workspaceId, defaultChannelId } = await kit.createWorkspace(owner);
    const admin = await kit.seedUser("Quản trị");
    await kit.addMembership(workspaceId, admin, "ADMIN");
    const m1 = await kit.seedUser("Thành viên một");
    const m2 = await kit.seedUser("Thành viên hai");
    await kit.addMembership(workspaceId, m1, "MEMBER");
    await kit.addMembership(workspaceId, m2, "MEMBER");
    await kit.enableGuests(workspaceId);
    const pubA = await kit.createChannel(owner, workspaceId, "PUBLIC", "Thông báo A");
    const pubB = await kit.createChannel(owner, workspaceId, "PUBLIC", "Thông báo B");
    const privP = await kit.createChannel(owner, workspaceId, "PRIVATE", "Riêng P");
    const privQ = await kit.createChannel(owner, workspaceId, "PRIVATE", "Riêng Q");
    // m1 ở trong privP (grant DIRECT do OWNER cấp); m2 KHÔNG.
    const grant = await request(app).post(`/api/v1/channels/${privP}/grants`).set(auth(owner)).send({ userIds: [m1], level: "MEMBER" });
    expect(grant.status).toBe(201);
    const guest = await kit.seedGuest(workspaceId, [pubA, privP]);
    return { owner, admin, m1, m2, workspaceId, defaultChannelId, pubA, pubB, privP, privQ, guest: guest.guestId, guestMembershipId: guest.membershipId };
  }

  const get = (userId: string, path: string) => request(app).get(`/api/v1${path}`).set(auth(userId));
  const names = (rows: Array<{ name: string }>) => rows.map((r) => r.name).sort();

  /** Chặn treo im lặng: mọi bước socket/job có trần thời gian để lỗi chỉ rõ bước nào kẹt. */
  const within = <T>(label: string, p: Promise<T>, ms = 10_000): Promise<T> =>
    Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Quá ${ms}ms ở bước: ${label}`)), ms))]);
  const joinRoom = (client: ClientSocket, kind: string, id: string): Promise<Ack> =>
    within(`room:join ${kind}`, emitWithAck<Ack>(client, "room:join", { kind, id }));

  async function connect(userId: string, deviceId = `dev-${randomUUID()}`): Promise<ClientSocket> {
    const client = await within("kết nối socket", connectClient(harness.port, { token: socketTokenFor(userId, `${userId}@e.com`), deviceId, platform: "ios" }));
    sockets.push(client);
    // `io.on("connection")` là async (join room, tra ws:* bằng DB, registry) rồi MỚI đăng ký handler `room:join` — client gửi ngay sau
    // `connect` có thể bị rơi (server chưa có listener). Chờ handler sẵn sàng để test không phụ thuộc thời điểm.
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const server = harness.io.sockets.sockets.get(client.id as string);
      if (server && server.listenerCount("room:join") > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    return client;
  }
  const waitFor = <T = unknown>(client: ClientSocket, event: string, ms = 3000): Promise<T> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Quá ${ms}ms chờ sự kiện ${event}`)), ms);
      client.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  describe("RB-01 — kênh: chỉ kênh chỉ định", () => {
    it("liệt kê/tìm chỉ thấy kênh chỉ định (kể cả public); kênh public/riêng không chỉ định và kênh mặc định → 404; join public không chỉ định → 404", async () => {
      const s = await scenario();
      const list = await get(s.guest, `/workspaces/${s.workspaceId}/channels?include=all`);
      expect(list.status).toBe(200);
      expect(names(list.body.data.joined)).toEqual(["Riêng P", "Thông báo A"]);
      expect(list.body.data.discoverable).toEqual([]);

      const search = await get(s.guest, `/workspaces/${s.workspaceId}/channels/search?q=${encodeURIComponent("thong bao")}`);
      expect(search.status).toBe(200);
      expect(names(search.body.data)).toEqual(["Thông báo A"]); // "Thông báo B" (public, không chỉ định) KHÔNG lộ
      const searchP = await get(s.guest, `/workspaces/${s.workspaceId}/channels/search?q=${encodeURIComponent("rieng")}`);
      expect(names(searchP.body.data)).toEqual(["Riêng P"]); // "Riêng Q" (không grant) KHÔNG lộ

      for (const ch of [s.pubA, s.privP]) expect((await get(s.guest, `/channels/${ch}`)).status).toBe(200);
      for (const ch of [s.pubB, s.privQ, s.defaultChannelId]) {
        expect((await get(s.guest, `/channels/${ch}`)).status).toBe(404);
        expect((await get(s.guest, `/channels/${ch}/messages`)).status).toBe(404);
        expect((await request(app).post(`/api/v1/channels/${ch}/join`).set(auth(s.guest))).status).toBe(404);
      }
      // Thành viên thường VẪN thấy kênh public (không đổi hành vi Phase 1).
      const memberList = await get(s.m2, `/workspaces/${s.workspaceId}/channels?include=all`);
      expect(names([...memberList.body.data.joined, ...memberList.body.data.discoverable])).toEqual(
        expect.arrayContaining(["Chung", "Thông báo A", "Thông báo B"])
      );
      expect(names(memberList.body.data.discoverable)).not.toContain("Riêng P");
    });

    it("khách gửi/đọc tin ở kênh chỉ định; thành viên thấy tin; danh sách người đọc kênh public loại khách không chỉ định", async () => {
      const s = await scenario();
      const sent = await request(app)
        .post(`/api/v1/channels/${s.pubA}/messages`)
        .set(auth(s.guest))
        .send({ clientMessageId: randomUUID(), content: "Xin chào từ khách" });
      expect(sent.status).toBe(201);
      const list = await get(s.m1, `/channels/${s.pubA}/messages`);
      expect(list.status).toBe(200);
      expect(JSON.stringify(list.body.data)).toContain("Xin chào từ khách");
      // Gửi vào kênh không chỉ định → 404.
      const denied = await request(app)
        .post(`/api/v1/channels/${s.pubB}/messages`)
        .set(auth(s.guest))
        .send({ clientMessageId: randomUUID(), content: "Không được" });
      expect(denied.status).toBe(404);
    });

    it("socket: room:join ch kênh chỉ định OK; kênh không chỉ định → PERM_404; room:join ws → từ chối; khách KHÔNG tự vào ws:{id} lúc kết nối", async () => {
      const s = await scenario();
      const guestSocket = await connect(s.guest);
      const memberSocket = await connect(s.m1);

      expect(await joinRoom(guestSocket, "ch", s.pubA)).toEqual({ ok: true });
      expect(await joinRoom(guestSocket, "ch", s.privP)).toEqual({ ok: true });
      expect(await joinRoom(guestSocket, "ch", s.pubB)).toMatchObject({ ok: false, code: "PERM_404" });
      expect(await joinRoom(guestSocket, "ch", s.privQ)).toMatchObject({ ok: false, code: "PERM_404" });
      expect(await joinRoom(guestSocket, "ws", s.workspaceId)).toMatchObject({ ok: false });

      const wsRoom = await harness.io.in(ROOM.workspace(s.workspaceId)).fetchSockets();
      const wsUsers = wsRoom.map((sk) => (sk.data as { user?: { id: string } }).user?.id);
      expect(wsUsers).toContain(s.m1);
      expect(wsUsers).not.toContain(s.guest);
      expect(await joinRoom(memberSocket, "ch", s.pubB)).toEqual({ ok: true });
    });
  });

  describe("RB-02 — danh bạ, mentionables, tổng quan", () => {
    it("danh bạ thành viên/thẻ thành viên/các chức năng quản trị → 404 trung tính; chi tiết & tổng quan không lộ memberCount/chính sách/khối thành viên", async () => {
      const s = await scenario();
      expect((await get(s.guest, `/workspaces/${s.workspaceId}/members`)).status).toBe(404);
      expect((await get(s.guest, `/workspaces/${s.workspaceId}/members/${s.m1}`)).status).toBe(404);
      expect((await get(s.guest, `/workspaces/${s.workspaceId}/invites`)).status).toBe(404);
      expect((await get(s.guest, `/workspaces/${s.workspaceId}/invitations`)).status).toBe(404);
      expect((await get(s.guest, `/workspaces/${s.workspaceId}/join-requests`)).status).toBe(404);
      expect((await request(app).post(`/api/v1/workspaces/${s.workspaceId}/channels`).set(auth(s.guest)).send({ name: "Lén tạo", visibility: "PUBLIC" })).status).toBe(404);
      expect((await request(app).post(`/api/v1/workspaces/${s.workspaceId}/invitations`).set(auth(s.guest)).send({ emails: ["a@b.co"] })).status).toBe(404);
      expect((await request(app).patch(`/api/v1/workspaces/${s.workspaceId}/settings`).set(auth(s.guest)).send({ joinPolicy: "OPEN", expectedVersion: 1 })).status).toBe(404);

      const detail = await get(s.guest, `/workspaces/${s.workspaceId}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data).toMatchObject({ myRole: "GUEST", name: "Nhóm thử", myPermissions: { canInvite: false, canCreateChannel: false, canEdit: false } });
      expect(detail.body.data.memberCount).toBeUndefined();
      expect(detail.body.data.joinPolicy).toBeUndefined();
      expect(detail.body.data.guestPolicy).toBeUndefined();
      expect(new Date(detail.body.data.myExpiresAt).getTime()).toBeGreaterThan(Date.now());

      const overview = await get(s.guest, `/workspaces/${s.workspaceId}/overview`);
      expect(overview.status).toBe(200);
      expect(overview.body.data.memberCount).toBeUndefined();
      expect(names(overview.body.data.channels.joined)).toEqual(["Riêng P", "Thông báo A"]);
      expect(overview.body.data.channels.default).toBeNull(); // kênh mặc định không được chỉ định
      expect(overview.body.data.recentGroups).toBeNull();
      expect(overview.body.data.needsResponse).toBeNull();

      const mine = await get(s.guest, "/workspaces");
      expect(mine.body.data).toHaveLength(1);
      expect(mine.body.data[0]).toMatchObject({ id: s.workspaceId, myRole: "GUEST", status: "ACTIVE" });
      expect(new Date(mine.body.data[0].myExpiresAt).getTime()).toBeGreaterThan(Date.now());
      // Thành viên thường vẫn thấy đủ.
      expect((await get(s.m1, `/workspaces/${s.workspaceId}/members`)).status).toBe(200);
    });

    it("thẻ thành viên của khách: OWNER/ADMIN thấy expiresAt + version + kênh chỉ định; MEMBER thấy khách trong danh bạ nhưng KHÔNG thấy hạn/version", async () => {
      const s = await scenario();
      const card = await get(s.admin, `/workspaces/${s.workspaceId}/members/${s.guest}`);
      expect(card.status).toBe(200);
      expect(card.body.data).toMatchObject({ userId: s.guest, role: "GUEST", version: 1 });
      expect(card.body.data.guestChannelIds.sort()).toEqual([s.pubA, s.privP].sort());
      expect(new Date(card.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());

      const memberCard = await get(s.m1, `/workspaces/${s.workspaceId}/members/${s.guest}`);
      expect(memberCard.status).toBe(200);
      expect(memberCard.body.data.expiresAt).toBeUndefined();
      expect(memberCard.body.data.version).toBeUndefined();
      expect(memberCard.body.data.guestChannelIds).toBeUndefined();

      const list = await get(s.admin, `/workspaces/${s.workspaceId}/members?role=GUEST`);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).toMatchObject({ userId: s.guest, role: "GUEST" });
      expect(list.body.data[0].expiresAt).toBeTruthy();
    });

    it("mentionables kênh public: thành viên + khách ĐƯỢC CHỈ ĐỊNH vào kênh đó; khách chỉ định kênh khác KHÔNG xuất hiện", async () => {
      const s = await scenario();
      const other = await kit.seedGuest(s.workspaceId, [s.pubB], { name: "Khách kênh B" });
      const onA = await get(s.owner, `/scopes/CHANNEL/${s.pubA}/mentionables`);
      expect(onA.status).toBe(200);
      const idsA = (onA.body.data.users as Array<{ userId: string }>).map((u) => u.userId);
      expect(idsA).toEqual(expect.arrayContaining([s.owner, s.admin, s.m1, s.m2, s.guest]));
      expect(idsA).not.toContain(other.guestId);

      const onB = await get(s.owner, `/scopes/CHANNEL/${s.pubB}/mentionables`);
      const idsB = (onB.body.data.users as Array<{ userId: string }>).map((u) => u.userId);
      expect(idsB).toContain(other.guestId);
      expect(idsB).not.toContain(s.guest);
    });
  });

  describe("RB-03 — nhắn tin riêng / nhóm chat", () => {
    it("khách nhắn người KHÔNG chung kênh chỉ định → 403 CONV_014 (cả hai chiều); chung kênh → được; khách không tạo nhóm chat", async () => {
      const s = await scenario();
      const privateOnly = await kit.seedGuest(s.workspaceId, [s.privP], { name: "Khách chỉ kênh riêng" });

      const denied = await request(app).post("/api/v1/conversations/direct").set(auth(privateOnly.guestId)).send({ userId: s.m2 });
      expect(denied.status).toBe(403);
      expect(denied.body.error.code).toBe("CONV_014");
      const reverse = await request(app).post("/api/v1/conversations/direct").set(auth(s.m2)).send({ userId: privateOnly.guestId });
      expect(reverse.status).toBe(403);
      expect(reverse.body.error.code).toBe("CONV_014");

      const ok = await request(app).post("/api/v1/conversations/direct").set(auth(privateOnly.guestId)).send({ userId: s.m1 }); // m1 có grant privP
      expect(ok.status).toBe(201);
      kit.conversationsCleanupIds.push(ok.body.data.id);

      // m2 vào privP → lần sau được.
      await request(app).post(`/api/v1/channels/${s.privP}/grants`).set(auth(s.owner)).send({ userIds: [s.m2], level: "MEMBER" });
      const retry = await request(app).post("/api/v1/conversations/direct").set(auth(privateOnly.guestId)).send({ userId: s.m2 });
      expect(retry.status).toBe(201);
      kit.conversationsCleanupIds.push(retry.body.data.id);

      // Khách có kênh public chỉ định → mọi thành viên đều "chung kênh" (đọc được kênh đó).
      const viaPublic = await request(app).post("/api/v1/conversations/direct").set(auth(s.guest)).send({ userId: s.admin });
      expect(viaPublic.status).toBe(201);
      kit.conversationsCleanupIds.push(viaPublic.body.data.id);

      const group = await request(app)
        .post("/api/v1/conversations")
        .set(auth(s.guest))
        .set("Idempotency-Key", `idem-${randomUUID()}`)
        .send({ workspaceId: s.workspaceId, title: "Nhóm lén", memberIds: [s.m1] });
      expect(group.status).toBe(404);
    });

    it("thêm KHÁCH vào nhóm chat: allowGuests=false → 403 CONV_015; bật allowGuests rồi OWNER/ADMIN nhóm thêm → được; MEMBER nhóm không thêm được khách", async () => {
      const s = await scenario();
      const created = await request(app)
        .post("/api/v1/conversations")
        .set(auth(s.owner))
        .set("Idempotency-Key", `idem-${randomUUID()}`)
        .send({ workspaceId: s.workspaceId, title: "Nhóm chat", memberIds: [s.m1] });
      expect(created.status).toBe(201);
      const convId = created.body.data.id as string;
      kit.conversationsCleanupIds.push(convId);

      const blocked = await request(app).post(`/api/v1/conversations/${convId}/members`).set(auth(s.owner)).send({ userIds: [s.guest] });
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe("CONV_015");

      const version = (await prisma.conversation.findUniqueOrThrow({ where: { id: convId } })).version;
      const patched = await request(app).patch(`/api/v1/conversations/${convId}`).set(auth(s.owner)).send({ allowGuests: true, expectedVersion: version });
      expect(patched.status).toBe(200);
      expect((await prisma.conversation.findUniqueOrThrow({ where: { id: convId } })).allowGuests).toBe(true);

      const added = await request(app).post(`/api/v1/conversations/${convId}/members`).set(auth(s.owner)).send({ userIds: [s.guest] });
      expect(added.status).toBe(200);
      expect(added.body.data.added).toEqual([s.guest]);
      expect(await prisma.conversationMember.count({ where: { conversationId: convId, userId: s.guest, status: "ACTIVE" } })).toBe(1);
    });
  });

  describe("RB-04 — hết hạn khi đang mở kênh trên 2 thiết bị", () => {
    it("job guest.expire: cả 2 socket nhận permission:revoked (reason EXPIRED) và bị đá khỏi ch:; membership REMOVED/EXPIRED; grant dọn; API 404; idempotent", async () => {
      const s = await scenario();
      const phone = await connect(s.guest, "phone");
      const tablet = await connect(s.guest, "tablet");
      for (const client of [phone, tablet]) {
        expect(await joinRoom(client, "ch", s.pubA)).toEqual({ ok: true });
      }
      expect((await harness.io.in(ROOM.channel(s.pubA)).fetchSockets()).length).toBe(2);
      const before = await prisma.workspace.findUniqueOrThrow({ where: { id: s.workspaceId } });

      const revoked = [waitFor<{ reason: string; scopeType: string; scopeId: string }>(phone, "permission:revoked"), waitFor<{ reason: string }>(tablet, "permission:revoked")];
      await prisma.workspaceMembership.update({ where: { id: s.guestMembershipId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await within("job guest.expire", processor("guest.expire")({ data: { membershipId: s.guestMembershipId, workspaceId: s.workspaceId, userId: s.guest, expiryVersion: 1 } }));
      const events = await Promise.all(revoked);
      expect(events[0]).toMatchObject({ reason: "EXPIRED", scopeType: "WORKSPACE", scopeId: s.workspaceId });
      expect(events[1]).toMatchObject({ reason: "EXPIRED" });

      // Bị đá khỏi room kênh (cascade từ WORKSPACE).
      const remaining = await harness.io.in(ROOM.channel(s.pubA)).fetchSockets();
      expect(remaining).toHaveLength(0);

      const row = await prisma.workspaceMembership.findUniqueOrThrow({ where: { id: s.guestMembershipId } });
      expect(row).toMatchObject({ status: "REMOVED", leftReason: "EXPIRED" });
      expect((await prisma.workspace.findUniqueOrThrow({ where: { id: s.workspaceId } })).memberCount).toBe(before.memberCount - 1);
      // Outbox: revoked (reason EXPIRED), dọn grant kênh, dọn nhóm chat.
      const outbox = await prisma.outboxEvent.findMany({ where: { aggregateId: `${s.workspaceId}:${s.guest}` } });
      expect(outbox.map((o) => o.jobName).sort()).toEqual(["channel.membership-revoked", "conversations.workspace-member-removed", "membership.events"].sort());
      const revokedEvent = outbox.find((o) => o.jobName === "membership.events")!.payload as Record<string, unknown>;
      expect(revokedEvent).toMatchObject({ event: "revoked", status: "REMOVED", reason: "EXPIRED" });
      // Chạy consumer dọn grant (relay không chạy trong test).
      const cleanup = outbox.find((o) => o.jobName === "channel.membership-revoked")!;
      await processor("channel.membership-revoked")({ data: cleanup.payload });
      expect(await prisma.channelGrant.count({ where: { workspaceId: s.workspaceId, userId: s.guest } })).toBe(0);
      expect(await prisma.channelMembership.count({ where: { workspaceId: s.workspaceId, userId: s.guest } })).toBe(0);

      expect((await get(s.guest, `/workspaces/${s.workspaceId}`)).status).toBe(404);
      expect((await get(s.guest, `/channels/${s.pubA}`)).status).toBe(404);
      expect((await get(s.guest, "/workspaces")).body.data).toEqual([]);

      // Chạy lại job → SKIPPED, không đổi memberCount.
      await processor("guest.expire")({ data: { membershipId: s.guestMembershipId, workspaceId: s.workspaceId, userId: s.guest, expiryVersion: 1 } });
      expect((await prisma.workspace.findUniqueOrThrow({ where: { id: s.workspaceId } })).memberCount).toBe(before.memberCount - 1);
    });

    it("quá hạn nhưng job CHƯA chạy → 404 ngay (không chờ job); cron quét bù gỡ khách; khách ACTIVE còn hạn không bị đụng", async () => {
      const s = await scenario();
      const fresh = await kit.seedGuest(s.workspaceId, [s.pubA], { name: "Khách còn hạn" });
      // Hạn ~1.2 giây nữa: lần đọc đầu còn hạn (ghi cache quyền kèm expiresAt), sau đó quá hạn NHƯNG job chưa chạy.
      await prisma.workspaceMembership.update({ where: { id: s.guestMembershipId }, data: { expiresAt: new Date(Date.now() + 1200) } });
      expect((await get(s.guest, `/workspaces/${s.workspaceId}`)).status).toBe(200); // làm nóng cache quyền
      expect((await get(s.guest, `/channels/${s.pubA}`)).status).toBe(200);
      await new Promise((r) => setTimeout(r, 1400));
      // Cache quyền (TTL 60s, version chưa bump) có expiresAt đã quá → coi như không thấy NGAY.
      expect((await get(s.guest, `/workspaces/${s.workspaceId}`)).status).toBe(404);
      expect((await get(s.guest, `/channels/${s.pubA}`)).status).toBe(404);
      expect((await get(s.guest, "/workspaces")).body.data).toEqual([]); // danh sách cũng ẩn khách quá hạn
      expect((await prisma.workspaceMembership.findUniqueOrThrow({ where: { id: s.guestMembershipId } })).status).toBe("ACTIVE");

      await processor("guests.expire-sweep")({ data: {} });
      expect(await prisma.workspaceMembership.findUniqueOrThrow({ where: { id: s.guestMembershipId } })).toMatchObject({ status: "REMOVED", leftReason: "EXPIRED" });
      expect((await prisma.workspaceMembership.findFirstOrThrow({ where: { userId: fresh.guestId, workspaceId: s.workspaceId } })).status).toBe("ACTIVE");
    });

    it("guest.expiring-notice: thông báo cho khách + người mời; chạy lại không nhân đôi; version cũ/đã hết hạn bị bỏ qua", async () => {
      const s = await scenario();
      await prisma.workspaceMembership.update({
        where: { id: s.guestMembershipId },
        data: { expiresAt: new Date(Date.now() + 24 * 3600_000), invitedBy: s.owner },
      });
      const payload = { membershipId: s.guestMembershipId, workspaceId: s.workspaceId, userId: s.guest, expiryVersion: 1 };
      await processor("guest.expiring-notice")({ data: payload });
      const recipients = await prisma.notificationRecipient.findMany({ where: { workspaceId: s.workspaceId, dedupeKey: { startsWith: "guest-expiring:" } } });
      expect(recipients.map((r) => r.recipientId).sort()).toEqual([s.guest, s.owner].sort());
      const notification = await prisma.notification.findFirstOrThrow({ where: { workspaceId: s.workspaceId, type: "guest.expiring" } });
      expect(notification.refs).toMatchObject({ workspaceId: s.workspaceId, guestUserId: s.guest, noticeHours: 48 });

      await processor("guest.expiring-notice")({ data: payload }); // chạy lại → bỏ qua, không lỗi P2002
      expect(await prisma.notification.count({ where: { workspaceId: s.workspaceId, type: "guest.expiring" } })).toBe(1);
      await processor("guest.expiring-notice")({ data: { ...payload, expiryVersion: 7 } }); // version lệch
      expect(await prisma.notification.count({ where: { workspaceId: s.workspaceId, type: "guest.expiring" } })).toBe(1);
    });
  });

  describe("RB-05 + PATCH guest", () => {
    const patchGuest = (actor: string, s: { workspaceId: string; guest: string }, body: object) =>
      request(app).patch(`/api/v1/workspaces/${s.workspaceId}/members/${s.guest}/guest`).set(auth(actor)).send(body);

    it("gia hạn trước giờ hết hạn: expiryVersion tăng, lịch cũ bị xoá/lịch mới tạo; job version CŨ chạy không làm gì, khách vẫn ACTIVE; sai expectedVersion → 409", async () => {
      const s = await scenario();
      // Lịch của version 1 (giả lập lúc chấp nhận).
      await prisma.outboxEvent.createMany({
        data: [
          { type: "guest.expire.schedule", aggregateType: "WorkspaceMembership", aggregateId: s.guestMembershipId, queue: "cron", jobName: "guest.expire", payload: {}, dedupeKey: `guest.expire:membership:${s.guestMembershipId}:v1`, availableAt: new Date(Date.now() + 10 * 24 * 3600_000) },
          { type: "guest.expiring-notice.schedule", aggregateType: "WorkspaceMembership", aggregateId: s.guestMembershipId, queue: "notifications", jobName: "guest.expiring-notice", payload: {}, dedupeKey: `guest.expiring-notice:membership:${s.guestMembershipId}:v1`, availableAt: new Date(Date.now() + 8 * 24 * 3600_000) },
        ],
      });
      const newExpiry = new Date(Date.now() + 20 * 24 * 3600_000);
      const res = await patchGuest(s.admin, s, { expiresAt: newExpiry.toISOString(), expectedVersion: 1 });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ userId: s.guest, role: "GUEST", version: 2 });
      expect(new Date(res.body.data.expiresAt).getTime()).toBe(newExpiry.getTime());

      expect(await prisma.outboxEvent.count({ where: { dedupeKey: { in: [`guest.expire:membership:${s.guestMembershipId}:v1`, `guest.expiring-notice:membership:${s.guestMembershipId}:v1`] } } })).toBe(0);
      const v2 = await prisma.outboxEvent.findFirstOrThrow({ where: { dedupeKey: `guest.expire:membership:${s.guestMembershipId}:v2` } });
      expect(v2.availableAt.getTime()).toBe(newExpiry.getTime());
      expect(await prisma.outboxEvent.count({ where: { dedupeKey: `guest.expiring-notice:membership:${s.guestMembershipId}:v2` } })).toBe(1);

      // Job version CŨ (đã tới hạn theo lịch cũ) chạy → không làm gì. Đặt hạn cũ về quá khứ để chứng minh CHỈ version chặn.
      await prisma.workspaceMembership.update({ where: { id: s.guestMembershipId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const memberCountBefore = (await prisma.workspace.findUniqueOrThrow({ where: { id: s.workspaceId } })).memberCount;
      await processor("guest.expire")({ data: { membershipId: s.guestMembershipId, workspaceId: s.workspaceId, userId: s.guest, expiryVersion: 1 } });
      expect((await prisma.workspaceMembership.findUniqueOrThrow({ where: { id: s.guestMembershipId } })).status).toBe("ACTIVE");
      expect((await prisma.workspace.findUniqueOrThrow({ where: { id: s.workspaceId } })).memberCount).toBe(memberCountBefore);
      await prisma.workspaceMembership.update({ where: { id: s.guestMembershipId }, data: { expiresAt: newExpiry } });

      const stale = await patchGuest(s.owner, s, { expiresAt: newExpiry.toISOString(), expectedVersion: 1 });
      expect(stale.status).toBe(409);
      expect(stale.body.error).toMatchObject({ code: "RES_003", details: { currentVersion: 2 } });
    });

    it("validate: hạn ở quá khứ / vượt maxDays / không phải khách / MEMBER không được sửa / thiếu thay đổi", async () => {
      const s = await scenario();
      const day = 24 * 3600_000;
      expect((await patchGuest(s.admin, s, { expiresAt: new Date(Date.now() - day).toISOString(), expectedVersion: 1 })).status).toBe(400);
      expect((await patchGuest(s.admin, s, { expiresAt: new Date(Date.now() + 31 * day).toISOString(), expectedVersion: 1 })).status).toBe(400); // maxDays 30
      expect((await patchGuest(s.admin, s, { expectedVersion: 1 })).status).toBe(400);
      expect((await patchGuest(s.m1, s, { expiresAt: new Date(Date.now() + day).toISOString(), expectedVersion: 1 })).status).toBe(403);
      const notGuest = await request(app)
        .patch(`/api/v1/workspaces/${s.workspaceId}/members/${s.m1}/guest`)
        .set(auth(s.owner))
        .send({ expiresAt: new Date(Date.now() + day).toISOString(), expectedVersion: 1 });
      expect(notGuest.status).toBe(400);
    });

    it("đổi kênh chỉ định: thêm pubB + bỏ privP → grant cập nhật, khách đọc pubB và mất privP; ADMIN không quản lý kênh riêng → 403 CH_013", async () => {
      const s = await scenario();
      const privateNotMine = await patchGuest(s.admin, s, { channelIds: [s.pubA, s.privQ], expectedVersion: 1 }); // ADMIN không có grant MANAGER privQ
      expect(privateNotMine.status).toBe(403);
      expect(privateNotMine.body.error.code).toBe("CH_013");

      const res = await patchGuest(s.owner, s, { channelIds: [s.pubA, s.pubB], expectedVersion: 1 });
      expect(res.status).toBe(200);
      expect(res.body.data.guestChannelIds.sort()).toEqual([s.pubA, s.pubB].sort());
      expect(res.body.data.version).toBe(2);
      expect((await get(s.guest, `/channels/${s.pubB}`)).status).toBe(200);
      expect((await get(s.guest, `/channels/${s.privP}`)).status).toBe(404); // đã gỡ
      expect(await prisma.channelGrant.count({ where: { channelId: s.privP, userId: s.guest } })).toBe(0);
      expect(await prisma.channelMembership.count({ where: { channelId: s.privP, userId: s.guest } })).toBe(0);
    });
  });

  describe("admin — chỉ đọc", () => {
    it("access-summary: chính sách + số đếm; invitations: email che, không token; members?role=GUEST kèm expiresAt; MEMBER thường 403", async () => {
      const s = await scenario();
      await kit.seedGuest(s.workspaceId, [s.pubA], { name: "Khách sắp hết hạn", expiresAt: new Date(Date.now() + 24 * 3600_000) });
      await request(app).post(`/api/v1/workspaces/${s.workspaceId}/invitations`).set(auth(s.owner)).send({ emails: ["Lan.Nguyen@Example.com"] });
      await prisma.workspace.update({ where: { id: s.workspaceId }, data: { joinPolicy: "APPROVAL" } });
      await prisma.workspaceMembership.create({ data: { workspaceId: s.workspaceId, userId: await kit.seedUser("Đang chờ"), role: "MEMBER", status: "PENDING", requestedAt: new Date() } });
      await prisma.channelGrant.create({ data: { channelId: s.privP, workspaceId: s.workspaceId, userId: null, subjectKey: "role:MEMBER", level: "MEMBER", source: "ROLE", roleRef: "MEMBER", grantedBy: s.owner } });
      // SummaryCard "link mời đang hoạt động": 1 link còn dùng, 1 đã thu hồi, 1 hết hạn, 1 hết lượt, 1 link cũ THIẾU trường `revokedAt` — chỉ 2 (dùng được + cũ) được đếm.
      const linkBase = { workspaceId: s.workspaceId, tokenPrefix: "abc123", role: "MEMBER" as const, maxUses: 5, createdBy: s.owner };
      const future = new Date(Date.now() + 3600_000);
      await prisma.inviteLink.create({ data: { ...linkBase, tokenHash: `h-ok-${s.workspaceId}`, remainingUses: 3, expiresAt: future, revokedAt: null } });
      await prisma.inviteLink.create({ data: { ...linkBase, tokenHash: `h-revoked-${s.workspaceId}`, remainingUses: 3, expiresAt: future, revokedAt: new Date() } });
      await prisma.inviteLink.create({ data: { ...linkBase, tokenHash: `h-expired-${s.workspaceId}`, remainingUses: 3, expiresAt: new Date(Date.now() - 1000), revokedAt: null } });
      await prisma.inviteLink.create({ data: { ...linkBase, tokenHash: `h-empty-${s.workspaceId}`, remainingUses: 0, expiresAt: future, revokedAt: null } });
      await prisma.inviteLink.create({ data: { ...linkBase, tokenHash: `h-legacy-${s.workspaceId}`, remainingUses: 2, expiresAt: future } });
      await prisma.workspaceMembership.create({ data: { workspaceId: s.workspaceId, userId: await kit.seedUser("Bị chặn"), role: "MEMBER", status: "BANNED" } });

      const adminToken = tokenFor(s.owner, "admin");
      const asAdmin = (path: string) => request(app).get(`/api/v1/admin/workspaces/${s.workspaceId}${path}`).set({ Authorization: `Bearer ${adminToken}` });

      const summary = await asAdmin("/access-summary");
      expect(summary.status).toBe(200);
      expect(summary.body.data).toMatchObject({
        joinPolicy: "APPROVAL",
        guestPolicy: { enabled: true, maxGuests: 5, maxDays: 30 },
        guests: { active: 2, expiringIn48h: 1 },
        pendingRequests: 1,
        pendingInvitations: 1,
        privateChannels: { total: 2, withRoleGrant: 1 },
        members: { banned: 1 },
        inviteLinks: { active: 2 },
      });
      expect(summary.body.data.members.active).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(summary.body)).not.toContain("Riêng P"); // chỉ SỐ LƯỢNG, không tên kênh riêng
      expect(JSON.stringify(summary.body)).not.toContain("h-ok-"); // không lộ token/hash link mời

      const invitations = await asAdmin("/invitations?page=1&limit=10");
      expect(invitations.status).toBe(200);
      expect(invitations.body.data).toHaveLength(1);
      expect(invitations.body.data[0]).toMatchObject({ email: "L***@Example.com", role: "MEMBER", status: "PENDING", invitedBy: s.owner });
      expect(invitations.body.meta).toMatchObject({ total: 1, page: 1 });
      expect(JSON.stringify(invitations.body.data)).not.toMatch(/lan\.nguyen|token|message/i);

      const guests = await asAdmin("/members?role=GUEST");
      expect(guests.body.data).toHaveLength(2);
      expect(guests.body.data.every((g: { role: string; expiresAt: string | null }) => g.role === "GUEST" && g.expiresAt)).toBe(true);
      const pending = await asAdmin("/members?status=PENDING");
      expect(pending.body.data).toHaveLength(1);
      expect(pending.body.data[0].requestedAt).toBeTruthy();

      const userToken = { Authorization: `Bearer ${tokenFor(s.owner)}` };
      expect((await request(app).get(`/api/v1/admin/workspaces/${s.workspaceId}/access-summary`).set(userToken)).status).toBe(403);
      expect((await asAdmin("/access-summary").set({ Authorization: `Bearer ${adminToken}` })).status).toBe(200);
    });
  });
});

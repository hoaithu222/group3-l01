/**
 * Integration — tìm toàn workspace p5-04 trên Prisma + Mongo THẬT (memory replset, `TEST_DB=memory`), Redis mock stateful; kênh (p1-03),
 * nhóm chat (p1-05), engine `messages` (p1-04) cùng chạy. Nghiệm thu phủ: SRCH-01..06 (+ tệp, kênh, người, `scopeType/scopeId`, cờ phụ).
 */
process.env.FEATURE_FLAGS = "communication=true,project=true";
jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.COMMUNICATION, actual.MODULES.PROJECT] };
});

jest.mock("../../../../infrastructure/redis", () => ({
  redis: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    ping: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    getdel: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    exists: jest.fn(),
    setNx: jest.fn(),
    hset: jest.fn(),
    hgetall: jest.fn(),
    hdel: jest.fn(),
    scanKeys: jest.fn(),
    getClient: jest.fn(),
  },
}));

jest.mock("../../../../core/permission/user-status", () => ({
  getUserStatusCached: jest.fn().mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 }),
  invalidateUserStatusCache: jest.fn().mockResolvedValue(undefined),
}));

const mockAuditRecord = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../audit-log/audit-log.service", () => ({
  AuditService: jest.fn().mockImplementation(() => ({ record: mockAuditRecord })),
}));

import request from "supertest";

import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { resetRuntimeConfig } from "../../../../core/config/runtime-config";
import { startHarness, stopHarness, type Harness } from "../../../../infrastructure/socket/tests/integration/test-helpers";
import { registerChannelModule } from "../../../channels";
import { registerConversationModule } from "../../../conversations";
import { registerMentionsModule } from "../../../mentions";
import {
  addMembership,
  auth,
  buildP504App,
  cleanupP504,
  createFixtures,
  createP504Indexes,
  makeRedisStore,
  normalizeUserName,
  searchWorkspace,
  seedMeeting,
  seedMessage,
  seedResource,
  wireRedisMocks,
} from "./search-fixtures";

jest.setTimeout(90_000);

const app = buildP504App();
const store = makeRedisStore();
const fx = createFixtures(app);

interface Hit {
  messageId: string;
  snippet: string;
  highlights: { start: number; end: number }[];
  scope: { type: string; id: string; name: string | null; isPrivate: boolean };
}

describe("workspace-search (integration)", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
    registerChannelModule();
    registerConversationModule();
    registerMentionsModule();
    await createP504Indexes();
  });

  afterAll(async () => {
    await stopHarness(harness);
    resetPermissionPorts();
  });

  beforeEach(() => {
    wireRedisMocks(redis as unknown as Record<string, jest.Mock>, store);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
  });

  afterEach(async () => {
    resetRuntimeConfig();
    await cleanupP504([...fx.workspaceIds], [...fx.userIds]);
    await fx.cleanup();
    store.clear();
    mockAuditRecord.mockClear();
  });

  /** owner + member trong 1 workspace, member có mặt ở kênh công khai + kênh riêng tư (được grant) + nhóm chat. */
  async function scenario() {
    const owner = await fx.newUser("Chủ nhóm");
    const member = await fx.newUser("Thành viên");
    const workspaceId = await fx.newWorkspace(owner, [member]);
    const publicChannel = await fx.newChannel(owner, workspaceId);
    const privateGranted = await fx.newChannel(owner, workspaceId, { visibility: "PRIVATE", initialMemberIds: [member] });
    const privateHidden = await fx.newChannel(owner, workspaceId, { visibility: "PRIVATE" });
    const group = await fx.newGroup(owner, workspaceId, [member]);
    const otherMember = await fx.newUser("Người khác");
    await addMembership(workspaceId, otherMember, "MEMBER");
    const groupWithoutMe = await fx.newGroup(owner, workspaceId, [otherMember]);
    return { owner, member, otherMember, workspaceId, publicChannel, privateGranted, privateHidden, group, groupWithoutMe };
  }

  it("SRCH-01: 'bao cao' thấy tin 'Báo cáo' ở kênh công khai, kênh riêng tư có grant và nhóm chat là thành viên — snippet giữ dấu", async () => {
    const s = await scenario();
    await fx.sendOk(s.owner, "CHANNEL", s.publicChannel, { content: "Báo cáo tuần này" });
    await fx.sendOk(s.owner, "CHANNEL", s.privateGranted, { content: "Nộp Báo cáo quý" });
    await fx.sendOk(s.owner, "CONVERSATION", s.group, { content: "Gửi báo cáo cho cô" });
    await fx.sendOk(s.owner, "CHANNEL", s.publicChannel, { content: "Chiều nay họp nhóm" });

    const res = await searchWorkspace(app, s.member, s.workspaceId, { q: "bao cao" });
    expect(res.status).toBe(200);
    const hits = res.body.data as Hit[];
    expect(hits).toHaveLength(3);
    expect(hits.map((h) => h.scope.id).sort()).toEqual([s.publicChannel, s.privateGranted, s.group].sort());
    const privateHit = hits.find((h) => h.scope.id === s.privateGranted)!;
    expect(privateHit.scope).toMatchObject({ type: "CHANNEL", isPrivate: true });
    expect(privateHit.snippet).toBe("Nộp Báo cáo quý");
    expect(privateHit.snippet.slice(privateHit.highlights[0].start, privateHit.highlights[0].end)).toBe("Báo");
    expect(res.body.meta).toMatchObject({ hasMore: false, partial: false, truncated: false, limit: 30 });
    // tìm có dấu cho cùng kết quả
    const accented = await searchWorkspace(app, s.member, s.workspaceId, { q: "báo cáo" });
    expect((accented.body.data as Hit[]).map((h) => h.messageId).sort()).toEqual(hits.map((h) => h.messageId).sort());
  });

  it("SRCH-02: kênh riêng tư KHÔNG grant và nhóm chat không là thành viên không xuất hiện; số liệu không rò rỉ", async () => {
    const s = await scenario();
    await fx.sendOk(s.owner, "CHANNEL", s.publicChannel, { content: "Báo cáo công khai" });
    await fx.sendOk(s.owner, "CHANNEL", s.privateHidden, { content: "Báo cáo mật của quản trị" });
    await fx.sendOk(s.owner, "CONVERSATION", s.groupWithoutMe, { content: "Báo cáo riêng của nhóm khác" });

    const res = await searchWorkspace(app, s.member, s.workspaceId, { q: "bao cao" });
    expect(res.status).toBe(200);
    const hits = res.body.data as Hit[];
    expect(hits.map((h) => h.scope.id)).toEqual([s.publicChannel]);
    expect(JSON.stringify(res.body)).not.toContain("mật của quản trị");
    expect(res.body.meta).not.toHaveProperty("total");
    // chủ nhóm là thành viên kênh riêng tư (người tạo) nên thấy đủ
    const asOwner = await searchWorkspace(app, s.owner, s.workspaceId, { q: "bao cao" });
    expect((asOwner.body.data as Hit[]).map((h) => h.scope.id).sort()).toEqual([s.publicChannel, s.privateHidden, s.groupWithoutMe].sort());
  });

  it("SRCH-03: trang 1 xong thì bị thu hồi grant, trang 2 không còn tin kênh đó (DU-02)", async () => {
    const s = await scenario();
    const publicOld = await fx.sendOk(s.owner, "CHANNEL", s.publicChannel, { content: "Báo cáo cũ ở kênh công khai" });
    const privateNew = await fx.sendOk(s.owner, "CHANNEL", s.privateGranted, { content: "Báo cáo mới ở kênh riêng tư" });

    const first = await searchWorkspace(app, s.member, s.workspaceId, { q: "bao cao", limit: 1 });
    expect(first.status).toBe(200);
    expect((first.body.data as Hit[]).map((h) => h.messageId)).toEqual([privateNew.id]);
    expect(first.body.meta.hasMore).toBe(true);

    // Thu hồi quyền kênh riêng tư của người tìm (chính chủ rời kênh) rồi lấy trang tiếp theo.
    await prisma.channelGrant.deleteMany({ where: { channelId: s.privateGranted, userId: s.member } });
    const second = await searchWorkspace(app, s.member, s.workspaceId, { q: "bao cao", limit: 5, cursor: first.body.meta.nextCursor });
    expect(second.status).toBe(200);
    expect((second.body.data as Hit[]).map((h) => h.messageId)).toEqual([publicOld.id]);

    // kể cả khi tìm lại từ đầu, tin kênh riêng tư không còn
    const again = await searchWorkspace(app, s.member, s.workspaceId, { q: "bao cao" });
    expect((again.body.data as Hit[]).map((h) => h.scope.id)).toEqual([s.publicChannel]);
  });

  it("SRCH-04: tin bị thu hồi (tombstone) hoặc ẩn phía tôi không được trả", async () => {
    const s = await scenario();
    const recalled = await fx.sendOk(s.owner, "CHANNEL", s.publicChannel, { content: "Báo cáo đã thu hồi" });
    const hidden = await fx.sendOk(s.owner, "CHANNEL", s.publicChannel, { content: "Báo cáo bị ẩn phía tôi" });
    const kept = await fx.sendOk(s.owner, "CHANNEL", s.publicChannel, { content: "Báo cáo còn nguyên" });

    const del = await request(app).delete(`/api/v1/messages/${recalled.id}`).set("Authorization", auth(s.owner)).send({});
    expect(del.status).toBe(200);
    const hide = await request(app).post(`/api/v1/messages/${hidden.id}/hide`).set("Authorization", auth(s.member)).send({});
    expect(hide.status).toBe(200);

    const asMember = await searchWorkspace(app, s.member, s.workspaceId, { q: "bao cao" });
    expect((asMember.body.data as Hit[]).map((h) => h.messageId)).toEqual([kept.id]);
    // người khác vẫn thấy tin chỉ bị ẩn phía riêng tôi
    const asOwner = await searchWorkspace(app, s.owner, s.workspaceId, { q: "bao cao" });
    expect((asOwner.body.data as Hit[]).map((h) => h.messageId).sort()).toEqual([hidden.id, kept.id].sort());
  });

  it("SRCH-05: khách tìm tab Người → 403 SRCH_103; khách chỉ thấy tin ở kênh được chỉ định", async () => {
    const s = await scenario();
    const guest = await fx.newUser("Khách mời");
    await addMembership(s.workspaceId, guest, "GUEST");
    await prisma.channelGrant.create({
      data: { channelId: s.publicChannel, workspaceId: s.workspaceId, userId: guest, subjectKey: guest, level: "MEMBER", source: "DIRECT", grantedBy: s.owner },
    });
    const other = await fx.newChannel(s.owner, s.workspaceId);
    await fx.sendOk(s.owner, "CHANNEL", s.publicChannel, { content: "Báo cáo cho khách" });
    await fx.sendOk(s.owner, "CHANNEL", other, { content: "Báo cáo nội bộ không chỉ định khách" });

    const people = await searchWorkspace(app, guest, s.workspaceId, { q: "khach", type: "people" });
    expect(people.status).toBe(403);
    expect(people.body.error.code).toBe("SRCH_103");

    const messages = await searchWorkspace(app, guest, s.workspaceId, { q: "bao cao" });
    expect(messages.status).toBe(200);
    expect((messages.body.data as Hit[]).map((h) => h.scope.id)).toEqual([s.publicChannel]);
    // khách không thể bật includeDirect để mở rộng phạm vi
    const direct = await searchWorkspace(app, guest, s.workspaceId, { q: "bao cao", includeDirect: true });
    expect((direct.body.data as Hit[]).map((h) => h.scope.id)).toEqual([s.publicChannel]);
  });

  it("SRCH-06: cuộc họp ATTENDEES không phải người tham dự thì không trả; WORKSPACE hiện với thành viên, không với khách", async () => {
    const s = await scenario();
    const guest = await fx.newUser("Khách");
    await addMembership(s.workspaceId, guest, "GUEST");
    const hostOnly = await seedMeeting({ workspaceId: s.workspaceId, hostId: s.owner, title: "Họp kế hoạch riêng", visibility: "ATTENDEES" });
    const invited = await seedMeeting({ workspaceId: s.workspaceId, hostId: s.owner, title: "Họp kế hoạch có mời", visibility: "ATTENDEES", attendeeIds: [s.member] });
    const open = await seedMeeting({ workspaceId: s.workspaceId, hostId: s.owner, title: "Họp kế hoạch toàn nhóm", visibility: "WORKSPACE" });

    const asMember = await searchWorkspace(app, s.member, s.workspaceId, { q: "ke hoach", type: "meetings" });
    expect(asMember.status).toBe(200);
    const ids = (asMember.body.data as { meetingId: string; isAttendee: boolean }[]).map((m) => m.meetingId);
    expect(ids.sort()).toEqual([invited, open].sort());
    expect(ids).not.toContain(hostOnly);
    expect((asMember.body.data as { meetingId: string; isAttendee: boolean }[]).find((m) => m.meetingId === invited)?.isAttendee).toBe(true);
    expect((asMember.body.data as { meetingId: string; isAttendee: boolean }[]).find((m) => m.meetingId === open)?.isAttendee).toBe(false);

    // chủ nhóm không tham dự cuộc họp nào của người khác vẫn KHÔNG thấy họp ATTENDEES của họ
    const asGuest = await searchWorkspace(app, guest, s.workspaceId, { q: "ke hoach", type: "meetings" });
    expect((asGuest.body.data as unknown[]).length).toBe(0);
  });

  it("tệp: tên tệp không dấu khớp tệp đính kèm tin (kênh đọc được) và tài liệu kho; tin ở kênh không đọc được thì không", async () => {
    const s = await scenario();
    await seedMessage({
      scopeType: "CHANNEL",
      scopeId: s.publicChannel,
      workspaceId: s.workspaceId,
      authorId: s.owner,
      content: "Đính kèm",
      attachments: [{ name: "Báo cáo tuần 12.pdf", size: 4096 }, { name: "Ảnh minh hoạ.png", kind: "IMAGE", mime: "image/png" }],
    });
    await seedMessage({
      scopeType: "CHANNEL",
      scopeId: s.privateHidden,
      workspaceId: s.workspaceId,
      authorId: s.owner,
      content: "Mật",
      attachments: [{ name: "Báo cáo mật.pdf" }],
    });
    const resourceId = await seedResource({ workspaceId: s.workspaceId, uploadedBy: s.owner, name: "Báo cáo tổng kết.pdf" });

    const res = await searchWorkspace(app, s.member, s.workspaceId, { q: "bao cao", type: "files" });
    expect(res.status).toBe(200);
    const files = res.body.data as { name: string; size: number; source: { kind: string; resourceId?: string; scope?: { id: string } } }[];
    expect(files.map((f) => f.name).sort()).toEqual(["Báo cáo tuần 12.pdf", "Báo cáo tổng kết.pdf"].sort());
    const fromResource = files.find((f) => f.source.kind === "RESOURCE")!;
    expect(fromResource.source.resourceId).toBe(resourceId);
    const fromMessage = files.find((f) => f.source.kind === "MESSAGE")!;
    expect(fromMessage.source.scope?.id).toBe(s.publicChannel);
    expect(JSON.stringify(res.body)).not.toContain("mật");
  });

  it("tệp trong reply của luồng có source.threadId = id tin gốc; tệp ở dòng chính có threadId null (client mở đúng màn luồng)", async () => {
    const s = await scenario();
    const base = { scopeType: "CHANNEL" as const, scopeId: s.publicChannel, workspaceId: s.workspaceId, authorId: s.owner };
    const rootId = await seedMessage({ ...base, content: "Gốc luồng" });
    const replyId = await seedMessage({ ...base, content: "Trả lời", threadId: rootId, attachments: [{ name: "Slide luồng.pdf" }] });
    const mainId = await seedMessage({ ...base, content: "Dòng chính", attachments: [{ name: "Slide chính.pdf" }] });

    const res = await searchWorkspace(app, s.member, s.workspaceId, { q: "slide", type: "files" });

    expect(res.status).toBe(200);
    const files = res.body.data as { name: string; source: { kind: string; messageId?: string; threadId?: string | null } }[];
    expect(files.find((f) => f.name === "Slide luồng.pdf")!.source).toMatchObject({ kind: "MESSAGE", messageId: replyId, threadId: rootId });
    expect(files.find((f) => f.name === "Slide chính.pdf")!.source).toMatchObject({ kind: "MESSAGE", messageId: mainId, threadId: null });
  });

  it("kênh: kênh công khai + kênh riêng tư có grant; kênh riêng tư không grant không lộ tên", async () => {
    const s = await scenario();
    const res = await searchWorkspace(app, s.member, s.workspaceId, { q: "kenh", type: "channels" });
    expect(res.status).toBe(200);
    const ids = (res.body.data as { channelId: string }[]).map((c) => c.channelId);
    expect(ids).toEqual(expect.arrayContaining([s.publicChannel, s.privateGranted]));
    expect(ids).not.toContain(s.privateHidden);
  });

  it("người: theo tên tài khoản không dấu; kết quả có vai trò", async () => {
    const s = await scenario();
    await normalizeUserName(s.otherMember, "Nguyễn Thị Hằng");
    const res = await searchWorkspace(app, s.member, s.workspaceId, { q: "hang", type: "people" });
    expect(res.status).toBe(200);
    expect((res.body.data as { userId: string; role: string; displayName: string }[])).toEqual([
      expect.objectContaining({ userId: s.otherMember, role: "MEMBER", displayName: "Nguyễn Thị Hằng" }),
    ]);
  });

  it("scopeType+scopeId: lọc một kênh; phạm vi không đọc được → 404 SRCH_102", async () => {
    const s = await scenario();
    await fx.sendOk(s.owner, "CHANNEL", s.publicChannel, { content: "Báo cáo A" });
    const other = await fx.newChannel(s.owner, s.workspaceId);
    await fx.sendOk(s.owner, "CHANNEL", other, { content: "Báo cáo B" });

    const scoped = await searchWorkspace(app, s.member, s.workspaceId, { q: "bao cao", scopeType: "CHANNEL", scopeId: other });
    expect((scoped.body.data as Hit[]).map((h) => h.scope.id)).toEqual([other]);
    const denied = await searchWorkspace(app, s.member, s.workspaceId, { q: "bao cao", scopeType: "CHANNEL", scopeId: s.privateHidden });
    expect(denied.status).toBe(404);
    expect(denied.body.error.code).toBe("SRCH_102");
  });

  it("từ khoá: quá ngắn → 400 SRCH_101; ký tự regex chỉ khớp literal; ngoài thời gian mặc định 12 tháng thì không trả", async () => {
    const s = await scenario();
    const short = await searchWorkspace(app, s.member, s.workspaceId, { q: "a" });
    expect(short.status).toBe(400);
    expect(short.body.error.code).toBe("SRCH_101");

    await fx.sendOk(s.owner, "CHANNEL", s.publicChannel, { content: "chuỗi a+b+ thật" });
    const literal = await searchWorkspace(app, s.member, s.workspaceId, { q: "a+b+" });
    expect((literal.body.data as Hit[]).length).toBe(1);
    const evil = await searchWorkspace(app, s.member, s.workspaceId, { q: ".*(a+)+$" });
    expect(evil.status).toBe(200);
    expect((evil.body.data as Hit[]).length).toBe(0);

    const ancient = new Date(Date.now() - 400 * 24 * 3600 * 1000);
    await seedMessage({ scopeType: "CHANNEL", scopeId: s.publicChannel, workspaceId: s.workspaceId, authorId: s.owner, content: "Kế hoạch từ rất lâu", createdAt: ancient });
    const noFrom = await searchWorkspace(app, s.member, s.workspaceId, { q: "ke hoach" });
    expect((noFrom.body.data as Hit[]).length).toBe(0);
    const withFrom = await searchWorkspace(app, s.member, s.workspaceId, { q: "ke hoach", from: new Date(ancient.getTime() - 86400_000).toISOString() });
    expect((withFrom.body.data as Hit[]).length).toBe(1);
  });

  it("includeDirect: gồm hội thoại 1-1 khi đối phương còn là thành viên; mặc định không gồm", async () => {
    const s = await scenario();
    const dm = await request(app)
      .post("/api/v1/conversations/direct")
      .set("Authorization", auth(s.member))
      .set("Idempotency-Key", `idem-${Date.now()}-dm`)
      .send({ userId: s.otherMember });
    expect([200, 201]).toContain(dm.status);
    const dmId = dm.body.data.id as string;
    fx.conversationIds.push(dmId);
    await fx.sendOk(s.otherMember, "CONVERSATION", dmId, { content: "Báo cáo riêng giữa hai người" });

    const off = await searchWorkspace(app, s.member, s.workspaceId, { q: "bao cao" });
    expect((off.body.data as Hit[]).length).toBe(0);
    const on = await searchWorkspace(app, s.member, s.workspaceId, { q: "bao cao", includeDirect: true });
    expect((on.body.data as Hit[]).map((h) => h.scope.id)).toEqual([dmId]);
    expect((on.body.data as Hit[])[0].scope.name).toBe("Người khác");
    // người thứ ba không thấy
    const third = await searchWorkspace(app, s.owner, s.workspaceId, { q: "bao cao", includeDirect: true });
    expect((third.body.data as Hit[]).length).toBe(0);
  });

  it("cờ phụ workspaceSearch tắt → 404 CFG_005; người ngoài nhóm → 404", async () => {
    const s = await scenario();
    const outsider = await fx.newUser("Người ngoài");
    const denied = await searchWorkspace(app, outsider, s.workspaceId, { q: "bao cao" });
    expect(denied.status).toBe(404);

    store.redisStore.set("cfg:features", { value: { workspaceSearch: false }, version: 1 });
    resetRuntimeConfig();
    const off = await searchWorkspace(app, s.member, s.workspaceId, { q: "bao cao" });
    expect(off.status).toBe(404);
    expect(off.body.error.code).toBe("CFG_005");
  });
});

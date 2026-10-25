import { InMemoryReadableScopesRepository } from "../repositories/readable-scopes.repository.inmemory";
import { ReadableScopesService } from "../services/readable-scopes.service";
import type { ReadableChannel } from "../entities/search.interface";

const WS = "w".repeat(24);
const OTHER_WS = "x".repeat(24);
const ME = "1".repeat(24);
const PEER = "2".repeat(24);
const STRANGER = "3".repeat(24);

let counter = 0;
const id = (): string => (++counter).toString(16).padStart(24, "0");

function channel(overrides: Partial<ReadableChannel> & { workspaceId?: string } = {}) {
  const { workspaceId, ...rest } = overrides;
  return {
    workspaceId: workspaceId ?? WS,
    id: id(),
    name: "Kênh",
    normalizedName: "kenh",
    type: "TEXT",
    visibility: "PUBLIC" as const,
    status: "ACTIVE" as const,
    memberCount: 1,
    lastActivityAt: new Date("2026-09-01T00:00:00Z"),
    ...rest,
  };
}

function setup() {
  const repo = new InMemoryReadableScopesRepository();
  return { repo, service: new ReadableScopesService(repo) };
}

const base = { userId: ME, workspaceId: WS, includeDirect: false } as const;

describe("ReadableScopesService — kênh", () => {
  it("SRCH-01/02: kênh công khai đọc được; kênh riêng tư chỉ khi có grant", async () => {
    const { repo, service } = setup();
    const pub = channel();
    const privateGranted = channel({ visibility: "PRIVATE" });
    const privateNoGrant = channel({ visibility: "PRIVATE" });
    repo.channels.push(pub, privateGranted, privateNoGrant);
    repo.grants.push({ workspaceId: WS, channelId: privateGranted.id, userId: ME, source: "DIRECT" });

    const { channels } = await service.compute({ ...base, role: "MEMBER" });
    expect([...channels.keys()].sort()).toEqual([pub.id, privateGranted.id].sort());
    expect(channels.has(privateNoGrant.id)).toBe(false);
  });

  it("kênh lưu trữ vẫn tìm được; kênh của workspace khác không bao giờ lọt vào", async () => {
    const { repo, service } = setup();
    const archived = channel({ status: "ARCHIVED" });
    const elsewhere = channel({ workspaceId: OTHER_WS });
    repo.channels.push(archived, elsewhere);
    const { channels } = await service.compute({ ...base, role: "OWNER" });
    expect([...channels.keys()]).toEqual([archived.id]);
  });

  it("grant theo VAI TRÒ phủ tới vai trò của người tìm: ADMIN phủ OWNER+ADMIN, MEMBER phủ cả MEMBER", async () => {
    const { repo, service } = setup();
    const forAdmins = channel({ visibility: "PRIVATE" });
    const forMembers = channel({ visibility: "PRIVATE" });
    repo.channels.push(forAdmins, forMembers);
    repo.grants.push(
      { workspaceId: WS, channelId: forAdmins.id, userId: null, source: "ROLE", roleRef: "ADMIN" },
      { workspaceId: WS, channelId: forMembers.id, userId: null, source: "ROLE", roleRef: "MEMBER" }
    );

    const asMember = await service.compute({ ...base, role: "MEMBER" });
    expect([...asMember.channels.keys()]).toEqual([forMembers.id]);
    const asAdmin = await service.compute({ ...base, role: "ADMIN" });
    expect([...asAdmin.channels.keys()].sort()).toEqual([forAdmins.id, forMembers.id].sort());
  });

  it("SRCH-05 (phạm vi): KHÁCH chỉ thấy kênh được chỉ định (cả công khai), không nhận grant theo vai trò", async () => {
    const { repo, service } = setup();
    const pubDesignated = channel();
    const pubOther = channel();
    const privDesignated = channel({ visibility: "PRIVATE" });
    const privByRole = channel({ visibility: "PRIVATE" });
    repo.channels.push(pubDesignated, pubOther, privDesignated, privByRole);
    repo.grants.push(
      { workspaceId: WS, channelId: pubDesignated.id, userId: ME, source: "DIRECT" },
      { workspaceId: WS, channelId: privDesignated.id, userId: ME, source: "DIRECT" },
      { workspaceId: WS, channelId: privByRole.id, userId: null, source: "ROLE", roleRef: "MEMBER" }
    );
    const { channels } = await service.compute({ ...base, role: "GUEST" });
    expect([...channels.keys()].sort()).toEqual([pubDesignated.id, privDesignated.id].sort());
  });
});

describe("ReadableScopesService — hội thoại", () => {
  it("nhóm chat: chỉ nhóm mình là thành viên; mang theo hiddenBeforeSeq", async () => {
    const { repo, service } = setup();
    const mine = { id: id(), kind: "GROUP" as const, title: "Nhóm", peerUserId: null, hiddenBeforeSeq: 7, lastActivityAt: null };
    const notMine = { id: id(), kind: "GROUP" as const, title: "Nhóm khác", peerUserId: null, hiddenBeforeSeq: 0, lastActivityAt: null };
    repo.groups.push({ ...mine, workspaceId: WS, memberIds: [ME] }, { ...notMine, workspaceId: WS, memberIds: [STRANGER] });

    const { conversations } = await service.compute({ ...base, role: "MEMBER" });
    expect([...conversations.keys()]).toEqual([mine.id]);
    expect(conversations.get(mine.id)?.hiddenBeforeSeq).toBe(7);
  });

  it("DIRECT chỉ khi includeDirect VÀ đối phương còn là thành viên ACTIVE của workspace (D-16)", async () => {
    const { repo, service } = setup();
    const withPeer = { id: id(), kind: "DIRECT" as const, title: null, peerUserId: null, hiddenBeforeSeq: 0, lastActivityAt: null };
    const withStranger = { ...withPeer, id: id() };
    repo.directs.push({ ...withPeer, memberIds: [ME, PEER] }, { ...withStranger, memberIds: [ME, STRANGER] });
    repo.memberships.push({ workspaceId: WS, userId: PEER, role: "MEMBER", active: true });

    const off = await service.compute({ ...base, role: "MEMBER" });
    expect(off.conversations.size).toBe(0);
    const on = await service.compute({ ...base, role: "MEMBER", includeDirect: true });
    expect([...on.conversations.keys()]).toEqual([withPeer.id]);
    expect(on.conversations.get(withPeer.id)?.peerUserId).toBe(PEER);
  });

  it("khách không bao giờ được gồm hội thoại 1-1 dù includeDirect", async () => {
    const { repo, service } = setup();
    const direct = { id: id(), kind: "DIRECT" as const, title: null, peerUserId: null, hiddenBeforeSeq: 0, lastActivityAt: null };
    repo.directs.push({ ...direct, memberIds: [ME, PEER] });
    repo.memberships.push({ workspaceId: WS, userId: PEER, role: "MEMBER", active: true });
    const { conversations } = await service.compute({ ...base, role: "GUEST", includeDirect: true });
    expect(conversations.size).toBe(0);
  });
});

describe("ReadableScopesService — trần và kiểm lại", () => {
  it("vượt trần: giữ các scope hoạt động gần nhất và báo truncated", async () => {
    const { repo, service } = setup();
    const old = channel({ lastActivityAt: new Date("2026-01-01T00:00:00Z") });
    const recent = channel({ lastActivityAt: new Date("2026-09-20T00:00:00Z") });
    const mid = channel({ lastActivityAt: new Date("2026-05-01T00:00:00Z") });
    repo.channels.push(old, recent, mid);

    const capped = await service.compute({ ...base, role: "MEMBER", max: 2 });
    expect(capped.truncated).toBe(true);
    expect([...capped.channels.keys()].sort()).toEqual([recent.id, mid.id].sort());
    const uncapped = await service.compute({ ...base, role: "MEMBER", max: 10 });
    expect(uncapped.truncated).toBe(false);
  });

  it("only: chỉ tính scope được yêu cầu (kiểm lại DU-02) — grant vừa thu hồi thì biến mất", async () => {
    const { repo, service } = setup();
    const priv = channel({ visibility: "PRIVATE" });
    const pub = channel();
    repo.channels.push(priv, pub);
    repo.grants.push({ workspaceId: WS, channelId: priv.id, userId: ME, source: "DIRECT" });

    const only = [{ type: "CHANNEL" as const, id: priv.id }];
    expect((await service.compute({ ...base, role: "MEMBER", only })).channels.has(priv.id)).toBe(true);
    repo.grants.length = 0; // thu hồi giữa hai trang
    const after = await service.compute({ ...base, role: "MEMBER", only });
    expect(after.channels.size).toBe(0);
    expect(after.truncated).toBe(false);
  });

  it("withChannels/withConversations=false bỏ hẳn nhóm đó", async () => {
    const { repo, service } = setup();
    repo.channels.push(channel());
    repo.groups.push({ id: id(), kind: "GROUP", title: "N", peerUserId: null, hiddenBeforeSeq: 0, lastActivityAt: null, workspaceId: WS, memberIds: [ME] });
    const noConv = await service.compute({ ...base, role: "MEMBER", withConversations: false });
    expect(noConv.channels.size).toBe(1);
    expect(noConv.conversations.size).toBe(0);
    const noChan = await service.compute({ ...base, role: "MEMBER", withChannels: false });
    expect(noChan.channels.size).toBe(0);
    expect(noChan.conversations.size).toBe(1);
  });
});

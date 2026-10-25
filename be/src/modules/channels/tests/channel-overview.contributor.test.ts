/**
 * Unit — `ChannelOverviewContributor` (khối "Kênh của bạn" của overview workspace,
 * README p1-01 §8 WS-09): lọc THEO QUYỀN người xem — kênh PRIVATE không có grant KHÔNG
 * lộ tên/số đếm (kể cả còn sót ChannelMembership), thứ tự ghim/mặc định/vị trí/tên,
 * trần 20, ARCHIVED bị loại, chưa có unread (p1-07).
 */
import { ChannelOverviewContributor, OVERVIEW_JOINED_MAX } from "../services/channel-overview.contributor";
import { InMemoryChannelRepository } from "../repositories/channel.repository.inmemory";
import { InMemoryChannelMembershipRepository } from "../repositories/channel-membership.repository.inmemory";
import { InMemoryChannelGrantRepository } from "../repositories/channel-grant.repository.inmemory";
import type { Channel, ChannelGrant, ChannelMembership } from "../entities/channel.interface";
import type { WorkspaceOverviewContext } from "../../../shared/ports/workspace-overview.port";
import type { ResolvedAccess } from "../../../core/permission";

const WS = "a1".repeat(12);
const ME = "b1".repeat(12);
const ctx = (userId = ME): WorkspaceOverviewContext => ({
  userId,
  workspaceId: WS,
  role: "MEMBER",
  access: { visible: true, role: "MEMBER", actions: new Set() } as unknown as ResolvedAccess,
});

let seq = 0;
function channel(over: Partial<Channel> = {}): Channel {
  seq += 1;
  const id = seq.toString(16).padStart(24, "0");
  return {
    id,
    workspaceId: WS,
    name: `Kênh ${seq}`,
    normalizedName: `kenh ${seq}`,
    description: null,
    type: "TEXT",
    visibility: "PUBLIC",
    postingPolicy: "MEMBERS",
    status: "ACTIVE",
    archiveReason: null,
    archivedAt: null,
    archivedBy: null,
    isDefault: false,
    position: 0,
    lastSeq: 0,
    lastMessageAt: null,
    lastMessageId: null,
    memberCount: 1,
    createdBy: ME,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

function membership(channelId: string, over: Partial<ChannelMembership> = {}): ChannelMembership {
  return { id: `m-${channelId}`, channelId, workspaceId: WS, userId: ME, notifyMode: "INHERIT", pinned: false, position: null, joinedAt: new Date(), updatedAt: new Date(), ...over };
}

function grant(channelId: string, userId = ME): ChannelGrant {
  return { id: `g-${channelId}-${userId}`, channelId, workspaceId: WS, userId, subjectKey: userId, level: "MEMBER", source: "DIRECT", roleRef: null, grantedBy: ME, createdAt: new Date() };
}

function setup(channels: Channel[], memberships: ChannelMembership[], grants: ChannelGrant[] = []) {
  const channelRepo = new InMemoryChannelRepository();
  const membershipRepo = new InMemoryChannelMembershipRepository();
  const grantRepo = new InMemoryChannelGrantRepository();
  channels.forEach((c) => channelRepo.seed(c));
  memberships.forEach((m) => membershipRepo.seed(m));
  grants.forEach((g) => grantRepo.seed(g));
  return new ChannelOverviewContributor(channelRepo, membershipRepo, grantRepo);
}

describe("ChannelOverviewContributor — WS-09", () => {
  it("đăng ký với khoá 'channels'", () => {
    expect(setup([], []).key).toBe("channels");
  });

  it("WS-09: kênh PRIVATE không grant KHÔNG xuất hiện — không tên, không id, không trong pinned (kể cả còn ChannelMembership cũ sót lại)", async () => {
    const chung = channel({ name: "Chung", isDefault: true });
    const riengTu = channel({ name: "Kế hoạch lương 2027 (tuyệt mật)", visibility: "PRIVATE" });
    const contributor = setup([chung, riengTu], [membership(chung.id), membership(riengTu.id, { pinned: true })] /* không có grant */);

    const block = await contributor.load(ctx());

    expect(block.joined.map((c) => c.id)).toEqual([chung.id]);
    expect(block.pinned).toEqual([]);
    expect(block.default).toEqual({ id: chung.id, name: "Chung" });
    const json = JSON.stringify(block);
    expect(json).not.toContain(riengTu.id);
    expect(json).not.toContain("Kế hoạch lương");
  });

  it("kênh PRIVATE CÓ grant + đã tham gia → hiện đầy đủ; có grant nhưng CHƯA tham gia → không nằm trong joined", async () => {
    const granted = channel({ name: "Nhóm dự án riêng", visibility: "PRIVATE" });
    const grantedNotJoined = channel({ name: "Được mời nhưng chưa vào", visibility: "PRIVATE" });
    const contributor = setup(
      [granted, grantedNotJoined],
      [membership(granted.id)],
      [grant(granted.id), grant(grantedNotJoined.id)]
    );
    const block = await contributor.load(ctx());
    expect(block.joined.map((c) => c.name)).toEqual(["Nhóm dự án riêng"]);
    expect(block.joined[0]).toMatchObject({ visibility: "PRIVATE", status: "ACTIVE" });
  });

  it("grant của NGƯỜI KHÁC không mở quyền cho tôi", async () => {
    const riengTu = channel({ name: "Của người khác", visibility: "PRIVATE" });
    const contributor = setup([riengTu], [membership(riengTu.id)], [grant(riengTu.id, "c9".repeat(12))]);
    expect((await contributor.load(ctx())).joined).toEqual([]);
  });

  it("chỉ kênh ACTIVE; kênh ARCHIVED (kể cả đã tham gia) bị loại", async () => {
    const live = channel({ name: "Còn hoạt động" });
    const archived = channel({ name: "Đã lưu trữ", status: "ARCHIVED" });
    const block = await setup([live, archived], [membership(live.id), membership(archived.id)]).load(ctx());
    expect(block.joined.map((c) => c.name)).toEqual(["Còn hoạt động"]);
  });

  it("chỉ kênh của workspace này; người dùng khác không thấy membership của tôi", async () => {
    const mine = channel({ name: "Của workspace này" });
    const foreign = channel({ name: "Workspace khác", workspaceId: "d1".repeat(12) });
    const contributor = setup([mine, foreign], [membership(mine.id), membership(foreign.id, { workspaceId: "d1".repeat(12) })]);
    expect((await contributor.load(ctx())).joined.map((c) => c.name)).toEqual(["Của workspace này"]);
    expect((await contributor.load(ctx("c8".repeat(12)))).joined).toEqual([]);
  });

  it("thứ tự: ghim → kênh mặc định → vị trí → tên; pinned là tập con giữ thứ tự", async () => {
    const zeta = channel({ name: "Zeta" });
    const alpha = channel({ name: "Alpha" });
    const chung = channel({ name: "Chung", isDefault: true });
    const pinnedB = channel({ name: "Ghim B" });
    const pinnedA = channel({ name: "Ghim A" });
    const positioned = channel({ name: "Có vị trí" });
    const contributor = setup(
      [zeta, alpha, chung, pinnedB, pinnedA, positioned],
      [
        membership(zeta.id),
        membership(alpha.id),
        membership(chung.id),
        membership(pinnedB.id, { pinned: true, position: 2 }),
        membership(pinnedA.id, { pinned: true, position: 1 }),
        membership(positioned.id, { position: 0 }),
      ]
    );
    const block = await contributor.load(ctx());
    expect(block.joined.map((c) => c.name)).toEqual(["Ghim A", "Ghim B", "Chung", "Có vị trí", "Alpha", "Zeta"]);
    expect(block.pinned.map((c) => c.name)).toEqual(["Ghim A", "Ghim B"]);
  });

  it(`trần joined ≤ ${OVERVIEW_JOINED_MAX}; kênh ghim vẫn nằm đầu; không có unread (chờ p1-07)`, async () => {
    const many = Array.from({ length: OVERVIEW_JOINED_MAX + 5 }, (_, i) => channel({ name: `Kênh ${String(i).padStart(2, "0")}` }));
    const contributor = setup(many, many.map((c, i) => membership(c.id, { pinned: i === many.length - 1 })));
    const block = await contributor.load(ctx());
    expect(block.joined).toHaveLength(OVERVIEW_JOINED_MAX);
    expect(block.joined[0].name).toBe(`Kênh ${String(many.length - 1).padStart(2, "0")}`); // kênh ghim (cuối danh sách gốc) lên đầu
    expect(block.pinned).toHaveLength(1);
    expect(block.joined.every((c) => !("unreadCount" in c) && !("mentionCount" in c))).toBe(true);
  });

  it("kênh mặc định không đọc được (giả định private không grant) → default=null, không lộ tên", async () => {
    const hidden = channel({ name: "Mặc định bị ẩn", isDefault: true, visibility: "PRIVATE" });
    const block = await setup([hidden], []).load(ctx());
    expect(block.default).toBeNull();
    expect(JSON.stringify(block)).not.toContain("Mặc định bị ẩn");
  });
});

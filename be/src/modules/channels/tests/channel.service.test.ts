/**
 * Unit — `ChannelService` (be.md §5.1/§5.2). `create()` chỉ các nhánh throw
 * TRƯỚC `withTransaction()` (mock `prisma.workspace.findUnique`/
 * `prisma.workspaceMembership.findMany` — 2 lời gọi thẳng Prisma ngoài
 * repository, xem docstring `channel.service.ts#requireActiveWorkspace`/
 * `create()`); happy-path ghi DB ở `tests/integration/channels.routes.test.ts`.
 * `list()/searchNames()/get()` không chạm transaction → unit-test đầy đủ.
 * `join()/leave()` chỉ nhánh KHÔNG chạm transaction (thành viên public đã có
 * sẵn/guard MANAGER cuối/isDefault/CH_008).
 */
const mockWorkspaceFindUnique = jest.fn();
const mockMembershipFindMany = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  prisma: {
    workspace: { findUnique: (...args: unknown[]) => mockWorkspaceFindUnique(...args) },
    workspaceMembership: { findMany: (...args: unknown[]) => mockMembershipFindMany(...args) },
  },
  withTransaction: jest.fn(),
}));

import { ChannelService } from "../services/channel.service";
import { InMemoryChannelRepository } from "../repositories/channel.repository.inmemory";
import { InMemoryChannelMembershipRepository } from "../repositories/channel-membership.repository.inmemory";
import { InMemoryChannelGrantRepository } from "../repositories/channel-grant.repository.inmemory";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { Channel, ChannelGrant, ChannelMembership } from "../entities/channel.interface";
import type { IChannelRoleAudience } from "../services/channel-role-audience";

function makeChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: "ch1",
    workspaceId: "ws1",
    name: "Frontend",
    normalizedName: "frontend",
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
    createdBy: "creator1",
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMembership(overrides: Partial<ChannelMembership> = {}): ChannelMembership {
  return {
    id: "m1",
    channelId: "ch1",
    workspaceId: "ws1",
    userId: "u1",
    notifyMode: "INHERIT",
    pinned: false,
    position: null,
    joinedAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeGrant(overrides: Partial<ChannelGrant> = {}): ChannelGrant {
  return {
    id: "g1",
    channelId: "ch1",
    workspaceId: "ws1",
    userId: "u1",
    level: "MEMBER",
    source: "DIRECT",
    roleRef: null,
    grantedBy: "creator1",
    createdAt: new Date(),
    ...overrides,
    // Grant DIRECT: subjectKey = userId (p3-04); ROLE seed tự đặt `subjectKey`.
    subjectKey: overrides.subjectKey ?? overrides.userId ?? "u1",
  };
}

function buildService(
  channelRepo = new InMemoryChannelRepository(),
  membershipRepo = new InMemoryChannelMembershipRepository(),
  grantRepo = new InMemoryChannelGrantRepository()
) {
  return { service: new ChannelService(channelRepo, membershipRepo, grantRepo), channelRepo, membershipRepo, grantRepo };
}

describe("ChannelService", () => {
  beforeEach(() => {
    mockWorkspaceFindUnique.mockReset();
    mockMembershipFindMany.mockReset().mockResolvedValue([]);
  });

  describe("create() — nhánh trước transaction", () => {
    it("type VOICE khi cờ voice tắt → CH_010", async () => {
      const { service } = buildService();
      await expect(
        service.create("actor1", "ws1", {
          name: "Phòng thoại",
          type: "VOICE",
          visibility: "PUBLIC",
          postingPolicy: "MEMBERS",
          initialMemberIds: [],
        })
      ).rejects.toMatchObject({ statusCode: 400, errorCode: ErrorCode.CH_010 });
      expect(mockWorkspaceFindUnique).not.toHaveBeenCalled();
    });

    it("type POMODORO khi cờ pomodoro tắt → CH_010", async () => {
      const { service } = buildService();
      await expect(
        service.create("actor1", "ws1", {
          name: "Pomodoro",
          type: "POMODORO",
          visibility: "PUBLIC",
          postingPolicy: "MEMBERS",
          initialMemberIds: [],
        })
      ).rejects.toMatchObject({ errorCode: ErrorCode.CH_010 });
    });

    it("workspace không tồn tại → NotFoundError", async () => {
      const { service } = buildService();
      mockWorkspaceFindUnique.mockResolvedValue(null);
      await expect(
        service.create("actor1", "ws1", {
          name: "Frontend",
          type: "TEXT",
          visibility: "PUBLIC",
          postingPolicy: "MEMBERS",
          initialMemberIds: [],
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("workspace ARCHIVED → WS_002", async () => {
      const { service } = buildService();
      mockWorkspaceFindUnique.mockResolvedValue({ id: "ws1", status: "ARCHIVED" });
      await expect(
        service.create("actor1", "ws1", {
          name: "Frontend",
          type: "TEXT",
          visibility: "PUBLIC",
          postingPolicy: "MEMBERS",
          initialMemberIds: [],
        })
      ).rejects.toMatchObject({ errorCode: ErrorCode.WS_002 });
    });

    it("đã đạt số kênh ACTIVE tối đa (perWorkspaceMax=200) → CH_006", async () => {
      const { service, channelRepo } = buildService();
      mockWorkspaceFindUnique.mockResolvedValue({ id: "ws1", status: "ACTIVE" });
      for (let i = 0; i < 200; i += 1) {
        channelRepo.seed(makeChannel({ id: `ch${i}`, workspaceId: "ws1", status: "ACTIVE" }));
      }
      await expect(
        service.create("actor1", "ws1", {
          name: "Kênh 201",
          type: "TEXT",
          visibility: "PUBLIC",
          postingPolicy: "MEMBERS",
          initialMemberIds: [],
        })
      ).rejects.toMatchObject({ statusCode: 409, errorCode: ErrorCode.CH_006 });
    });

    it("PRIVATE với initialMemberIds có người không còn ACTIVE trong workspace → CH_011 kèm details.invalidUserIds", async () => {
      const { service } = buildService();
      mockWorkspaceFindUnique.mockResolvedValue({ id: "ws1", status: "ACTIVE" });
      // Chỉ u2 còn ACTIVE — u3 (đã rời nhóm) không nằm trong kết quả findMany.
      mockMembershipFindMany.mockResolvedValue([{ userId: "u2" }]);

      await expect(
        service.create("actor1", "ws1", {
          name: "Riêng tư",
          type: "TEXT",
          visibility: "PRIVATE",
          postingPolicy: "MEMBERS",
          initialMemberIds: ["u2", "u3"],
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: ErrorCode.CH_011,
        details: { invalidUserIds: ["u3"] },
      });
    });
  });

  describe("list() — sắp xếp + joined/discover (be.md §5.2)", () => {
    it("joined sắp: pinned trước → isDefault → position → tên", async () => {
      const { service, channelRepo, membershipRepo } = buildService();
      channelRepo.seed(makeChannel({ id: "c-b", name: "B kênh", status: "ACTIVE" }));
      channelRepo.seed(makeChannel({ id: "c-a-default", name: "A mặc định", isDefault: true, status: "ACTIVE" }));
      channelRepo.seed(makeChannel({ id: "c-pinned", name: "Z ghim", status: "ACTIVE" }));
      membershipRepo.seed(makeMembership({ id: "m-b", channelId: "c-b", userId: "u1" }));
      membershipRepo.seed(makeMembership({ id: "m-a", channelId: "c-a-default", userId: "u1" }));
      membershipRepo.seed(makeMembership({ id: "m-p", channelId: "c-pinned", userId: "u1", pinned: true }));

      const { joined } = await service.list("u1", "ws1", { include: "joined", status: "ACTIVE" });
      expect(joined.map((c) => c.id)).toEqual(["c-pinned", "c-a-default", "c-b"]);
    });

    it("discoverable chỉ gồm kênh PUBLIC ACTIVE chưa tham gia", async () => {
      const { service, channelRepo, membershipRepo } = buildService();
      channelRepo.seed(makeChannel({ id: "joined-pub", name: "Đã vào", status: "ACTIVE", visibility: "PUBLIC" }));
      channelRepo.seed(makeChannel({ id: "discover-pub", name: "Khám phá", status: "ACTIVE", visibility: "PUBLIC" }));
      channelRepo.seed(makeChannel({ id: "discover-priv", name: "Riêng tư", status: "ACTIVE", visibility: "PRIVATE" }));
      membershipRepo.seed(makeMembership({ channelId: "joined-pub", userId: "u1" }));

      const { discoverable } = await service.list("u1", "ws1", { include: "discover", status: "ACTIVE" });
      expect(discoverable.map((c) => c.id)).toEqual(["discover-pub"]);
    });

    it("status=ARCHIVED → discoverable rỗng (chỉ discover khi ACTIVE)", async () => {
      const { service, channelRepo } = buildService();
      channelRepo.seed(makeChannel({ id: "c1", status: "ARCHIVED" }));
      const { discoverable } = await service.list("u1", "ws1", { include: "all", status: "ARCHIVED" });
      expect(discoverable).toEqual([]);
    });

    it("lọc theo type khi truyền type", async () => {
      const { service, channelRepo, membershipRepo } = buildService();
      channelRepo.seed(makeChannel({ id: "text1", type: "TEXT", status: "ACTIVE" }));
      membershipRepo.seed(makeMembership({ channelId: "text1", userId: "u1" }));

      const { joined } = await service.list("u1", "ws1", { include: "joined", status: "ACTIVE", type: "VOICE" });
      expect(joined).toEqual([]);
    });
  });

  describe("searchNames() — normalizeSearch + giới hạn hiển thị (be.md §5.2)", () => {
    it('"Đồ án" khớp kênh tên "Do An" qua normalizeSearch', async () => {
      const { service, channelRepo } = buildService();
      channelRepo.seed(makeChannel({ id: "c1", name: "Do An", normalizedName: "do an", status: "ACTIVE" }));

      const results = await service.searchNames("u1", "ws1", "Đồ án");
      expect(results.map((c) => c.id)).toEqual(["c1"]);
    });

    it("kênh PRIVATE không có grant → không xuất hiện trong kết quả tìm kiếm (PR-02)", async () => {
      const { service, channelRepo } = buildService();
      channelRepo.seed(makeChannel({ id: "priv1", name: "Bí mật", normalizedName: "bi mat", visibility: "PRIVATE", status: "ACTIVE" }));

      const results = await service.searchNames("u1", "ws1", "bi mat");
      expect(results).toEqual([]);
    });

    it("kênh PRIVATE CÓ grant → xuất hiện trong kết quả", async () => {
      const { service, channelRepo, grantRepo } = buildService();
      channelRepo.seed(makeChannel({ id: "priv1", name: "Bí mật", normalizedName: "bi mat", visibility: "PRIVATE", status: "ACTIVE" }));
      grantRepo.seed(makeGrant({ channelId: "priv1", userId: "u1" }));

      const results = await service.searchNames("u1", "ws1", "bi mat");
      expect(results.map((c) => c.id)).toEqual(["priv1"]);
    });

    it("p3-04: kênh PRIVATE cấp cho VAI TRÒ phủ tới người dùng → xuất hiện; vai trò không phủ tới → không", async () => {
      const channelRepo = new InMemoryChannelRepository();
      const grantRepo = new InMemoryChannelGrantRepository();
      channelRepo.seed(makeChannel({ id: "priv1", name: "Bí mật", normalizedName: "bi mat", visibility: "PRIVATE", status: "ACTIVE" }));
      grantRepo.seed(makeGrant({ channelId: "priv1", userId: null, source: "ROLE", roleRef: "ADMIN" }));
      const roles = (covering: string[]) => ({ coveringRolesOf: jest.fn().mockResolvedValue(covering) }) as unknown as IChannelRoleAudience;

      const asAdmin = new ChannelService(channelRepo, new InMemoryChannelMembershipRepository(), grantRepo, roles(["ADMIN", "MEMBER"]));
      expect((await asAdmin.searchNames("u1", "ws1", "bi mat")).map((c) => c.id)).toEqual(["priv1"]);

      const asMember = new ChannelService(channelRepo, new InMemoryChannelMembershipRepository(), grantRepo, roles(["MEMBER"]));
      expect(await asMember.searchNames("u1", "ws1", "bi mat")).toEqual([]);
    });

    it("giới hạn tối đa 20 kết quả", async () => {
      const { service, channelRepo } = buildService();
      for (let i = 0; i < 25; i += 1) {
        channelRepo.seed(makeChannel({ id: `c${i}`, name: `Test ${i}`, normalizedName: `test ${i}`, status: "ACTIVE" }));
      }
      const results = await service.searchNames("u1", "ws1", "test");
      expect(results.length).toBeLessThanOrEqual(20);
    });
  });

  describe("get()", () => {
    it("kênh không tồn tại → NotFoundError", async () => {
      const { service } = buildService();
      await expect(service.get("khong-ton-tai", "u1", { visible: true, role: "MEMBER", actions: new Set() })).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe("join() — nhánh không chạm transaction", () => {
    it("kênh không tồn tại → NotFoundError", async () => {
      const { service } = buildService();
      await expect(service.join("u1", "khong-ton-tai")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("kênh PRIVATE → CH_008 (join chỉ áp dụng public)", async () => {
      const { service, channelRepo } = buildService();
      channelRepo.seed(makeChannel({ visibility: "PRIVATE" }));
      await expect(service.join("u1", "ch1")).rejects.toMatchObject({
        statusCode: 400,
        errorCode: ErrorCode.CH_008,
      });
    });

    it("đã là thành viên → trả về item hiện tại, không tạo lại (idempotent, không chạm transaction)", async () => {
      const { service, channelRepo, membershipRepo } = buildService();
      channelRepo.seed(makeChannel({ visibility: "PUBLIC" }));
      membershipRepo.seed(makeMembership({ channelId: "ch1", userId: "u1" }));

      const item = await service.join("u1", "ch1");
      expect(item.id).toBe("ch1");
    });
  });

  describe("leave() — nhánh không chạm transaction", () => {
    it("kênh không tồn tại → NotFoundError", async () => {
      const { service } = buildService();
      await expect(service.leave("u1", "khong-ton-tai")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("kênh mặc định → CH_009 (không thể rời kênh mặc định)", async () => {
      const { service, channelRepo } = buildService();
      channelRepo.seed(makeChannel({ isDefault: true }));
      await expect(service.leave("u1", "ch1")).rejects.toMatchObject({
        statusCode: 400,
        errorCode: ErrorCode.CH_009,
      });
    });

    it("PRIVATE + đang là MANAGER cuối + kênh ACTIVE → CH_003", async () => {
      const { service, channelRepo, grantRepo } = buildService();
      channelRepo.seed(makeChannel({ visibility: "PRIVATE", status: "ACTIVE" }));
      grantRepo.seed(makeGrant({ userId: "u1", level: "MANAGER" }));

      await expect(service.leave("u1", "ch1")).rejects.toMatchObject({
        statusCode: 409,
        errorCode: ErrorCode.CH_003,
      });
    });
  });
});

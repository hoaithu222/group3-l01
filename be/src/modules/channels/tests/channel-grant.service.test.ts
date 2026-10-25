/**
 * Unit — `ChannelGrantService` (be.md §5.4). Nhánh throw trước `withTransaction()`
 * (cùng quy ước `membership-lifecycle.service.test.ts`), cộng các nhánh
 * "no-op" tự nhiên không chạm transaction (`patchLevel` cùng level,
 * `revoke` idempotent) — happy-path ghi DB thật ở `tests/integration/`.
 * `members()` cho kênh PRIVATE lọc/sắp/paginate hoàn toàn trong service (không
 * qua Prisma) nên unit-test trực tiếp được ở đây (tương đương
 * `membership.repository.prisma.ts` app-level filter của p1-02).
 */
const mockGetStates = jest.fn();
jest.mock("../../presence/presence.service", () => ({
  getStates: (...args: unknown[]) => mockGetStates(...args),
}));

jest.mock("../../../infrastructure/database", () => ({
  prisma: { workspaceMembership: { findMany: jest.fn() } },
  withTransaction: jest.fn(),
}));

import { ChannelGrantService } from "../services/channel-grant.service";
import { InMemoryChannelRepository } from "../repositories/channel.repository.inmemory";
import { InMemoryChannelMembershipRepository } from "../repositories/channel-membership.repository.inmemory";
import { InMemoryChannelGrantRepository } from "../repositories/channel-grant.repository.inmemory";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { Channel, ChannelGrant } from "../entities/channel.interface";
import type { IChannelRoleAudience } from "../services/channel-role-audience";

function makeChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: "ch1",
    workspaceId: "ws1",
    name: "Riêng tư",
    normalizedName: "rieng tu",
    description: null,
    type: "TEXT",
    visibility: "PRIVATE",
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

function buildService(channelRepo: InMemoryChannelRepository, grantRepo: InMemoryChannelGrantRepository) {
  return new ChannelGrantService(channelRepo, new InMemoryChannelMembershipRepository(), grantRepo);
}

describe("ChannelGrantService", () => {
  beforeEach(() => mockGetStates.mockReset().mockResolvedValue({}));

  describe("listGrants()", () => {
    it("kênh không tồn tại → NotFoundError", async () => {
      const service = buildService(new InMemoryChannelRepository(), new InMemoryChannelGrantRepository());
      await expect(service.listGrants("khong-ton-tai")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("kênh PUBLIC → CH_008 (grants chỉ áp dụng PRIVATE)", async () => {
      const channelRepo = new InMemoryChannelRepository();
      channelRepo.seed(makeChannel({ visibility: "PUBLIC" }));
      const service = buildService(channelRepo, new InMemoryChannelGrantRepository());
      await expect(service.listGrants("ch1")).rejects.toMatchObject({
        statusCode: 400,
        errorCode: ErrorCode.CH_008,
      });
    });
  });

  describe("add() — nhánh trước transaction", () => {
    it("kênh không tồn tại → NotFoundError", async () => {
      const service = buildService(new InMemoryChannelRepository(), new InMemoryChannelGrantRepository());
      await expect(service.add("actor1", "khong-ton-tai", { userIds: ["u1"], level: "MEMBER" })).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("kênh PUBLIC → CH_008", async () => {
      const channelRepo = new InMemoryChannelRepository();
      channelRepo.seed(makeChannel({ visibility: "PUBLIC" }));
      const service = buildService(channelRepo, new InMemoryChannelGrantRepository());
      await expect(service.add("actor1", "ch1", { userIds: ["u1"], level: "MEMBER" })).rejects.toMatchObject({
        errorCode: ErrorCode.CH_008,
      });
    });

    it("kênh PRIVATE đã ARCHIVED → CH_004", async () => {
      const channelRepo = new InMemoryChannelRepository();
      channelRepo.seed(makeChannel({ visibility: "PRIVATE", status: "ARCHIVED" }));
      const service = buildService(channelRepo, new InMemoryChannelGrantRepository());
      await expect(service.add("actor1", "ch1", { userIds: ["u1"], level: "MEMBER" })).rejects.toMatchObject({
        statusCode: 403,
        errorCode: ErrorCode.CH_004,
      });
    });
  });

  describe("patchLevel()", () => {
    it("kênh PUBLIC → CH_008", async () => {
      const channelRepo = new InMemoryChannelRepository();
      channelRepo.seed(makeChannel({ visibility: "PUBLIC" }));
      const service = buildService(channelRepo, new InMemoryChannelGrantRepository());
      await expect(service.patchLevel("actor1", "ch1", "u1", "MANAGER")).rejects.toMatchObject({
        errorCode: ErrorCode.CH_008,
      });
    });

    it("grant không tồn tại → NotFoundError", async () => {
      const channelRepo = new InMemoryChannelRepository();
      channelRepo.seed(makeChannel());
      const service = buildService(channelRepo, new InMemoryChannelGrantRepository());
      await expect(service.patchLevel("actor1", "ch1", "u-khong-co-grant", "MANAGER")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("hạ MANAGER cuối cùng xuống MEMBER → CH_003", async () => {
      const channelRepo = new InMemoryChannelRepository();
      channelRepo.seed(makeChannel());
      const grantRepo = new InMemoryChannelGrantRepository();
      grantRepo.seed(makeGrant({ userId: "manager1", level: "MANAGER" }));
      const service = buildService(channelRepo, grantRepo);
      await expect(service.patchLevel("actor1", "ch1", "manager1", "MEMBER")).rejects.toMatchObject({
        statusCode: 409,
        errorCode: ErrorCode.CH_003,
      });
    });

    it("patch level GIỐNG level hiện tại (no-op) → không chạm transaction, trả lại grant hiện tại", async () => {
      const channelRepo = new InMemoryChannelRepository();
      channelRepo.seed(makeChannel());
      const grantRepo = new InMemoryChannelGrantRepository();
      grantRepo.seed(makeGrant({ userId: "u1", level: "MEMBER" }));
      const service = buildService(channelRepo, grantRepo);

      const row = await service.patchLevel("actor1", "ch1", "u1", "MEMBER");
      expect(row.userId).toBe("u1");
      expect(row.level).toBe("MEMBER");
    });
  });

  describe("revoke() — idempotent (be.md §5.4)", () => {
    it("kênh PUBLIC → no-op, không throw", async () => {
      const channelRepo = new InMemoryChannelRepository();
      channelRepo.seed(makeChannel({ visibility: "PUBLIC" }));
      const service = buildService(channelRepo, new InMemoryChannelGrantRepository());
      await expect(service.revoke("actor1", "ch1", "u1")).resolves.toBeUndefined();
    });

    it("grant không tồn tại (đã thu hồi trước đó) → no-op, không throw", async () => {
      const channelRepo = new InMemoryChannelRepository();
      channelRepo.seed(makeChannel());
      const service = buildService(channelRepo, new InMemoryChannelGrantRepository());
      await expect(service.revoke("actor1", "ch1", "u-khong-co-grant")).resolves.toBeUndefined();
    });

    it("thu hồi MANAGER cuối cùng khi kênh ACTIVE → CH_003", async () => {
      const channelRepo = new InMemoryChannelRepository();
      channelRepo.seed(makeChannel({ status: "ACTIVE" }));
      const grantRepo = new InMemoryChannelGrantRepository();
      grantRepo.seed(makeGrant({ userId: "manager1", level: "MANAGER" }));
      const service = buildService(channelRepo, grantRepo);
      await expect(service.revoke("actor1", "ch1", "manager1")).rejects.toMatchObject({
        statusCode: 409,
        errorCode: ErrorCode.CH_003,
      });
    });
  });

  describe("p3-04 — grant theo vai trò trong listGrants()/members()", () => {
    const covered = (rows: Array<{ id: string; name: string; roleRef: "ADMIN" | "MEMBER"; avatarAssetId?: string }>) =>
      ({
        listCoveredUsers: jest
          .fn()
          .mockResolvedValue(rows.map((r) => ({ user: { id: r.id, name: r.name, normalizedName: r.name, avatarAssetId: r.avatarAssetId ?? null }, roleRef: r.roleRef }))),
        listCoveredUserIds: jest.fn(),
        coveringRolesOf: jest.fn(),
      }) as unknown as IChannelRoleAudience;

    it("listGrants: dòng ROLE (subject.type=ROLE, userId/name null) đứng TRƯỚC dòng DIRECT; DIRECT giữ hợp đồng Phase 1", async () => {
      const channelRepo = new InMemoryChannelRepository();
      channelRepo.seed(makeChannel());
      const grantRepo = new InMemoryChannelGrantRepository();
      grantRepo.seed(makeGrant({ userId: "m1", level: "MANAGER" }));
      grantRepo.seed(makeGrant({ id: "g-role", userId: null, source: "ROLE", roleRef: "MEMBER", level: "MEMBER" }));
      const service = buildService(channelRepo, grantRepo);

      const rows = await service.listGrants("ch1");
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ subject: { type: "ROLE", roleRef: "MEMBER", label: "Thành viên" }, userId: null, name: null, source: "ROLE", level: "MEMBER" });
      expect(rows[1]).toMatchObject({ subject: { type: "USER", user: { id: "m1" } }, userId: "m1", source: "DIRECT", level: "MANAGER" });
    });

    it("members(): người đọc được nhờ vai trò hiện với source ROLE + roleRef; người vừa có DIRECT vừa có vai trò chỉ hiện một dòng DIRECT", async () => {
      const channelRepo = new InMemoryChannelRepository();
      channelRepo.seed(makeChannel());
      const grantRepo = new InMemoryChannelGrantRepository();
      grantRepo.seed(makeGrant({ userId: "u1", level: "MANAGER" }));
      const service = new ChannelGrantService(
        channelRepo,
        new InMemoryChannelMembershipRepository(),
        grantRepo,
        covered([
          { id: "u1", name: "Trùng DIRECT", roleRef: "MEMBER" },
          { id: "r1", name: "Chỉ qua vai trò", roleRef: "ADMIN", avatarAssetId: "65f0000000000000000000a1" },
        ])
      );
      mockGetStates.mockResolvedValue({});

      const { data, total } = await service.members("viewer", "ch1", { page: 1, limit: 30 });
      expect(total).toBe(2);
      expect(data.find((r) => r.userId === "u1")).toMatchObject({ source: "DIRECT", level: "MANAGER", avatarUrl: null });
      expect(data.find((r) => r.userId === "u1")?.roleRef).toBeUndefined();
      expect(data.find((r) => r.userId === "r1")).toMatchObject({ source: "ROLE", level: "MEMBER", roleRef: "ADMIN" });
      // Ảnh lấy từ `avatarAssetId` đã nạp cùng truy vấn user → URL ký sẵn (THUMB) dùng thẳng làm nguồn ảnh.
      expect(data.find((r) => r.userId === "r1")?.avatarUrl).toContain("/api/v1/assets/65f0000000000000000000a1/image?v=THUMB");
    });
  });

  describe("members() — kênh PRIVATE: lọc/sắp/paginate trong service (không qua Prisma)", () => {
    function seedThreeGrants(grantRepo: InMemoryChannelGrantRepository) {
      grantRepo.seed(makeGrant({ id: "g1", userId: "u1", level: "MANAGER" }));
      grantRepo.seed(makeGrant({ id: "g2", userId: "u2", level: "MEMBER" }));
      grantRepo.seed(makeGrant({ id: "g3", userId: "u3", level: "MEMBER" }));
    }

    it("không có q → trả cả 3, sắp theo tên (user.name mặc định '?' trong in-memory nên ổn định theo id chèn)", async () => {
      const channelRepo = new InMemoryChannelRepository();
      channelRepo.seed(makeChannel());
      const grantRepo = new InMemoryChannelGrantRepository();
      seedThreeGrants(grantRepo);
      mockGetStates.mockResolvedValue({ u1: { state: "ONLINE" }, u2: { state: "OFFLINE" }, u3: { state: "DND" } });
      const service = buildService(channelRepo, grantRepo);

      const { data, total } = await service.members("viewer1", "ch1", { page: 1, limit: 30 });
      expect(total).toBe(3);
      expect(data).toHaveLength(3);
      expect(data.find((r) => r.userId === "u1")?.level).toBe("MANAGER");
      expect(data.find((r) => r.userId === "u1")?.presence).toBe("ONLINE");
    });

    it("phân trang (page/limit) cắt đúng theo total", async () => {
      const channelRepo = new InMemoryChannelRepository();
      channelRepo.seed(makeChannel());
      const grantRepo = new InMemoryChannelGrantRepository();
      seedThreeGrants(grantRepo);
      const service = buildService(channelRepo, grantRepo);

      const { data, total } = await service.members("viewer1", "ch1", { page: 2, limit: 2 });
      expect(total).toBe(3);
      expect(data).toHaveLength(1);
    });

    it("q lọc theo tên (không khớp) → danh sách rỗng, total 0", async () => {
      const channelRepo = new InMemoryChannelRepository();
      channelRepo.seed(makeChannel());
      const grantRepo = new InMemoryChannelGrantRepository();
      seedThreeGrants(grantRepo); // user.name mặc định "?" trong in-memory repo
      const service = buildService(channelRepo, grantRepo);

      const { data, total } = await service.members("viewer1", "ch1", { page: 1, limit: 30, q: "khong-khop-voi-gi" });
      expect(data).toHaveLength(0);
      expect(total).toBe(0);
    });

    it("presence mặc định OFFLINE khi getStates không trả entry", async () => {
      const channelRepo = new InMemoryChannelRepository();
      channelRepo.seed(makeChannel());
      const grantRepo = new InMemoryChannelGrantRepository();
      grantRepo.seed(makeGrant({ userId: "u1", level: "MEMBER" }));
      mockGetStates.mockResolvedValue({});
      const service = buildService(channelRepo, grantRepo);

      const { data } = await service.members("viewer1", "ch1", { page: 1, limit: 30 });
      expect(data[0]?.presence).toBe("OFFLINE");
    });
  });
});

/**
 * Unit — CHỈ các nhánh throw TRƯỚC KHI chạm `withTransaction()` (be.md §5.3/§5.8),
 * cùng quy ước `membership-lifecycle.service.test.ts` (p1-02): "happy path"
 * (ghi DB thật) cần Prisma thật → test ở `tests/integration/channels.routes.test.ts`.
 */
const mockWorkspaceFindUnique = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  prisma: { workspace: { findUnique: (...args: unknown[]) => mockWorkspaceFindUnique(...args) } },
  withTransaction: jest.fn(),
}));

import { ChannelLifecycleService } from "../services/channel-lifecycle.service";
import { InMemoryChannelRepository } from "../repositories/channel.repository.inmemory";
import { InMemoryChannelMembershipRepository } from "../repositories/channel-membership.repository.inmemory";
import { InMemoryChannelGrantRepository } from "../repositories/channel-grant.repository.inmemory";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { Channel } from "../entities/channel.interface";

function makeChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: "ch1",
    workspaceId: "ws1",
    name: "Chung",
    normalizedName: "chung",
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

function buildService(channelRepo: InMemoryChannelRepository) {
  return new ChannelLifecycleService(
    channelRepo,
    new InMemoryChannelMembershipRepository(),
    new InMemoryChannelGrantRepository()
  );
}

describe("ChannelLifecycleService — nhánh trước transaction (be.md §5.3/§5.8)", () => {
  beforeEach(() => mockWorkspaceFindUnique.mockReset());

  describe("archive()", () => {
    it("kênh không tồn tại → NotFoundError", async () => {
      const repo = new InMemoryChannelRepository();
      const service = buildService(repo);
      await expect(service.archive("actor1", "khong-ton-tai", { expectedVersion: 1 })).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("kênh mặc định (isDefault) không kèm replacementDefaultChannelId → CH_005", async () => {
      const repo = new InMemoryChannelRepository();
      repo.seed(makeChannel({ isDefault: true }));
      const service = buildService(repo);
      await expect(service.archive("actor1", "ch1", { expectedVersion: 1 })).rejects.toMatchObject({
        statusCode: 409,
        errorCode: ErrorCode.CH_005,
      });
    });

    it("replacement không tồn tại → CH_005", async () => {
      const repo = new InMemoryChannelRepository();
      repo.seed(makeChannel({ isDefault: true }));
      const service = buildService(repo);
      await expect(
        service.archive("actor1", "ch1", { expectedVersion: 1, replacementDefaultChannelId: "khong-ton-tai" })
      ).rejects.toMatchObject({ errorCode: ErrorCode.CH_005 });
    });

    it("replacement thuộc workspace khác → CH_005", async () => {
      const repo = new InMemoryChannelRepository();
      repo.seed(makeChannel({ id: "ch1", isDefault: true, workspaceId: "ws1" }));
      repo.seed(makeChannel({ id: "ch2", workspaceId: "ws-khac", type: "TEXT", visibility: "PUBLIC", status: "ACTIVE" }));
      const service = buildService(repo);
      await expect(
        service.archive("actor1", "ch1", { expectedVersion: 1, replacementDefaultChannelId: "ch2" })
      ).rejects.toMatchObject({ errorCode: ErrorCode.CH_005 });
    });

    it("replacement === chính kênh đang archive → CH_005", async () => {
      const repo = new InMemoryChannelRepository();
      repo.seed(makeChannel({ id: "ch1", isDefault: true, workspaceId: "ws1" }));
      const service = buildService(repo);
      await expect(
        service.archive("actor1", "ch1", { expectedVersion: 1, replacementDefaultChannelId: "ch1" })
      ).rejects.toMatchObject({ errorCode: ErrorCode.CH_005 });
    });

    it("replacement không phải TEXT (vd VOICE) → CH_005", async () => {
      const repo = new InMemoryChannelRepository();
      repo.seed(makeChannel({ id: "ch1", isDefault: true, workspaceId: "ws1" }));
      repo.seed(makeChannel({ id: "ch2", workspaceId: "ws1", type: "VOICE", visibility: "PUBLIC", status: "ACTIVE" }));
      const service = buildService(repo);
      await expect(
        service.archive("actor1", "ch1", { expectedVersion: 1, replacementDefaultChannelId: "ch2" })
      ).rejects.toMatchObject({ errorCode: ErrorCode.CH_005 });
    });

    it("replacement không phải PUBLIC (vd PRIVATE) → CH_005", async () => {
      const repo = new InMemoryChannelRepository();
      repo.seed(makeChannel({ id: "ch1", isDefault: true, workspaceId: "ws1" }));
      repo.seed(makeChannel({ id: "ch2", workspaceId: "ws1", type: "TEXT", visibility: "PRIVATE", status: "ACTIVE" }));
      const service = buildService(repo);
      await expect(
        service.archive("actor1", "ch1", { expectedVersion: 1, replacementDefaultChannelId: "ch2" })
      ).rejects.toMatchObject({ errorCode: ErrorCode.CH_005 });
    });

    it("replacement không ACTIVE (đã ARCHIVED) → CH_005", async () => {
      const repo = new InMemoryChannelRepository();
      repo.seed(makeChannel({ id: "ch1", isDefault: true, workspaceId: "ws1" }));
      repo.seed(makeChannel({ id: "ch2", workspaceId: "ws1", type: "TEXT", visibility: "PUBLIC", status: "ARCHIVED" }));
      const service = buildService(repo);
      await expect(
        service.archive("actor1", "ch1", { expectedVersion: 1, replacementDefaultChannelId: "ch2" })
      ).rejects.toMatchObject({ errorCode: ErrorCode.CH_005 });
    });
  });

  describe("restore()", () => {
    it("kênh không tồn tại → NotFoundError", async () => {
      const repo = new InMemoryChannelRepository();
      const service = buildService(repo);
      await expect(service.restore("actor1", "khong-ton-tai", { expectedVersion: 1 })).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("kênh đang ACTIVE → ConflictError (không cần khôi phục)", async () => {
      const repo = new InMemoryChannelRepository();
      repo.seed(makeChannel({ status: "ACTIVE" }));
      const service = buildService(repo);
      await expect(service.restore("actor1", "ch1", { expectedVersion: 1 })).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it("archiveReason NO_MANAGER → CH_007 (không khôi phục bằng thao tác thường)", async () => {
      const repo = new InMemoryChannelRepository();
      repo.seed(makeChannel({ status: "ARCHIVED", archiveReason: "NO_MANAGER" }));
      const service = buildService(repo);
      await expect(service.restore("actor1", "ch1", { expectedVersion: 1 })).rejects.toMatchObject({
        statusCode: 403,
        errorCode: ErrorCode.CH_007,
      });
    });

    it("archiveReason PLATFORM → CH_007", async () => {
      const repo = new InMemoryChannelRepository();
      repo.seed(makeChannel({ status: "ARCHIVED", archiveReason: "PLATFORM" }));
      const service = buildService(repo);
      await expect(service.restore("actor1", "ch1", { expectedVersion: 1 })).rejects.toMatchObject({
        errorCode: ErrorCode.CH_007,
      });
    });

    it("archiveReason MANUAL nhưng workspace ARCHIVED → WS_002", async () => {
      const repo = new InMemoryChannelRepository();
      repo.seed(makeChannel({ status: "ARCHIVED", archiveReason: "MANUAL" }));
      const service = buildService(repo);
      mockWorkspaceFindUnique.mockResolvedValue({ status: "ARCHIVED" });
      await expect(service.restore("actor1", "ch1", { expectedVersion: 1 })).rejects.toMatchObject({
        errorCode: ErrorCode.WS_002,
      });
    });
  });

  describe("platformArchive()/platformRestore() (be.md §4 admin — chỉ kênh PUBLIC)", () => {
    it("platformArchive(): kênh không tồn tại → NotFoundError", async () => {
      const repo = new InMemoryChannelRepository();
      const service = buildService(repo);
      await expect(service.platformArchive("admin1", "khong-ton-tai", "Vi phạm nội quy")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("platformArchive(): kênh PRIVATE → CH_012 (không thao tác cấp nền tảng)", async () => {
      const repo = new InMemoryChannelRepository();
      repo.seed(makeChannel({ visibility: "PRIVATE" }));
      const service = buildService(repo);
      await expect(service.platformArchive("admin1", "ch1", "Vi phạm nội quy")).rejects.toMatchObject({
        statusCode: 403,
        errorCode: ErrorCode.CH_012,
      });
    });

    it("platformArchive(): kênh mặc định → CH_005 (admin không tự chọn thay thế)", async () => {
      const repo = new InMemoryChannelRepository();
      repo.seed(makeChannel({ visibility: "PUBLIC", isDefault: true }));
      const service = buildService(repo);
      await expect(service.platformArchive("admin1", "ch1", "Vi phạm nội quy")).rejects.toMatchObject({
        errorCode: ErrorCode.CH_005,
      });
    });

    it("platformRestore(): kênh PRIVATE → CH_012", async () => {
      const repo = new InMemoryChannelRepository();
      repo.seed(makeChannel({ visibility: "PRIVATE", status: "ARCHIVED", archiveReason: "PLATFORM" }));
      const service = buildService(repo);
      await expect(service.platformRestore("admin1", "ch1", "Xem xét lại")).rejects.toMatchObject({
        errorCode: ErrorCode.CH_012,
      });
    });

    it("platformRestore(): kênh đang ACTIVE → ConflictError", async () => {
      const repo = new InMemoryChannelRepository();
      repo.seed(makeChannel({ visibility: "PUBLIC", status: "ACTIVE" }));
      const service = buildService(repo);
      await expect(service.platformRestore("admin1", "ch1", "Xem xét lại")).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });

  describe("orphanCheck() (be.md §5.8 — idempotent, CAS)", () => {
    it("kênh không tồn tại → false, không chạm transaction", async () => {
      const repo = new InMemoryChannelRepository();
      const service = buildService(repo);
      await expect(service.orphanCheck("khong-ton-tai")).resolves.toBe(false);
    });

    it("kênh đã ARCHIVED → false (đã lưu trữ rồi, retry vô hại)", async () => {
      const repo = new InMemoryChannelRepository();
      repo.seed(makeChannel({ visibility: "PRIVATE", status: "ARCHIVED", archiveReason: "NO_MANAGER" }));
      const service = buildService(repo);
      await expect(service.orphanCheck("ch1")).resolves.toBe(false);
    });

    it("kênh PUBLIC → false (orphan-check chỉ áp dụng PRIVATE)", async () => {
      const repo = new InMemoryChannelRepository();
      repo.seed(makeChannel({ visibility: "PUBLIC", status: "ACTIVE" }));
      const service = buildService(repo);
      await expect(service.orphanCheck("ch1")).resolves.toBe(false);
    });

    it("còn ít nhất 1 MANAGER → false, không lưu trữ", async () => {
      const channelRepo = new InMemoryChannelRepository();
      channelRepo.seed(makeChannel({ visibility: "PRIVATE", status: "ACTIVE" }));
      const grantRepo = new InMemoryChannelGrantRepository();
      grantRepo.seed({
        id: "g1",
        channelId: "ch1",
        workspaceId: "ws1",
        userId: "manager1",
        level: "MANAGER",
        source: "DIRECT",
        roleRef: null,
        grantedBy: "manager1",
        createdAt: new Date(),
      });
      const service = new ChannelLifecycleService(channelRepo, new InMemoryChannelMembershipRepository(), grantRepo);
      await expect(service.orphanCheck("ch1")).resolves.toBe(false);
    });
  });
});

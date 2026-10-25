const mockGetStates = jest.fn();
jest.mock("../../presence/presence.service", () => ({
  getStates: (...args: unknown[]) => mockGetStates(...args),
}));

import { MemberQueryService } from "../services/member-query.service";
import { InMemoryMembershipRepository } from "../repositories/membership.repository.inmemory";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { WorkspaceMembership } from "../entities/member.interface";

function makeMembership(overrides: Partial<WorkspaceMembership> = {}): WorkspaceMembership {
  return {
    id: "m1",
    workspaceId: "ws1",
    userId: "u1",
    role: "MEMBER",
    status: "ACTIVE",
    displayName: null,
    joinedAt: new Date(),
    leftAt: null,
    expiresAt: null,
    invitedBy: null,
    inviteLinkId: null,
    banReason: null,
    removedBy: null,
    ...overrides,
  };
}

describe("MemberQueryService", () => {
  let repo: InMemoryMembershipRepository;
  let service: MemberQueryService;

  beforeEach(() => {
    repo = new InMemoryMembershipRepository();
    service = new MemberQueryService(repo);
    mockGetStates.mockReset().mockResolvedValue({});
  });

  describe("list()", () => {
    it("PERM_001 khi viewer MEMBER lọc status=BANNED", async () => {
      await expect(
        service.list("u1", "MEMBER", "ws1", { status: "BANNED", sort: "role", page: 1, limit: 30 })
      ).rejects.toMatchObject({ statusCode: 403, errorCode: ErrorCode.PERM_001 });
      expect(mockGetStates).not.toHaveBeenCalled();
    });

    it("ADMIN lọc status=BANNED → được phép", async () => {
      repo.seedUser({ id: "u2", name: "B", normalizedName: "b", email: "b@e.com", avatarAssetId: null });
      repo.seedMembership(makeMembership({ id: "m2", userId: "u2", status: "BANNED" }));
      mockGetStates.mockResolvedValue({ u2: { state: "OFFLINE" } });

      const result = await service.list("u1", "ADMIN", "ws1", { status: "BANNED", sort: "role", page: 1, limit: 30 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.status).toBe("BANNED");
    });

    it("OWNER lọc status=BANNED → được phép", async () => {
      repo.seedUser({ id: "u2", name: "B", normalizedName: "b", email: "b@e.com", avatarAssetId: null });
      repo.seedMembership(makeMembership({ id: "m2", userId: "u2", status: "BANNED" }));
      mockGetStates.mockResolvedValue({ u2: { state: "OFFLINE" } });

      const result = await service.list("u1", "OWNER", "ws1", { status: "BANNED", sort: "role", page: 1, limit: 30 });
      expect(result.data).toHaveLength(1);
    });

    it("status=ACTIVE (mặc định) → MEMBER xem được bình thường, presence lấy từ getStates", async () => {
      repo.seedUser({ id: "u1", name: "A", normalizedName: "a", email: "a@e.com", avatarAssetId: null });
      repo.seedMembership(makeMembership({ id: "m1", userId: "u1", status: "ACTIVE" }));
      mockGetStates.mockResolvedValue({ u1: { state: "ONLINE" } });

      const result = await service.list("u1", "MEMBER", "ws1", { status: "ACTIVE", sort: "role", page: 1, limit: 30 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.presence).toBe("ONLINE");
      expect(mockGetStates).toHaveBeenCalledWith("u1", ["u1"]);
    });

    it("presence mặc định OFFLINE khi getStates không trả entry cho user đó", async () => {
      repo.seedUser({ id: "u2", name: "B", normalizedName: "b", email: "b@e.com", avatarAssetId: null });
      repo.seedMembership(makeMembership({ id: "m2", userId: "u2", status: "ACTIVE" }));
      mockGetStates.mockResolvedValue({});

      const result = await service.list("u1", "MEMBER", "ws1", { status: "ACTIVE", sort: "role", page: 1, limit: 30 });
      expect(result.data[0]!.presence).toBe("OFFLINE");
    });
  });

  describe("getCard()", () => {
    it("404 khi không tìm thấy thành viên", async () => {
      mockGetStates.mockResolvedValue({});
      await expect(service.getCard("u1", "OWNER", "ws1", "u-khong-ton-tai")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("trả MemberCard kèm actions khi tìm thấy", async () => {
      repo.seedUser({ id: "u2", name: "B", normalizedName: "b", email: "b@e.com", avatarAssetId: null });
      repo.seedMembership(makeMembership({ id: "m2", userId: "u2", role: "MEMBER" }));
      mockGetStates.mockResolvedValue({ u2: { state: "DND" } });

      const card = await service.getCard("u1", "OWNER", "ws1", "u2");
      expect(card.userId).toBe("u2");
      expect(card.presence).toBe("DND");
      expect(card.actions).toMatchObject({ canRemove: true, canBan: true });
    });

    describe("canMessage/canCall do server tính qua MemberContactPort (D-16)", () => {
      const seedTarget = (userId: string, status: "ACTIVE" | "BANNED" = "ACTIVE") => {
        repo.seedUser({ id: userId, name: userId, normalizedName: userId, email: `${userId}@e.com`, avatarAssetId: null });
        repo.seedMembership(makeMembership({ id: `m-${userId}`, userId, status, role: "MEMBER" }));
        mockGetStates.mockResolvedValue({});
      };

      it("thành viên ACTIVE khác mình → theo kết quả của cổng", async () => {
        seedTarget("u2");
        const evaluate = jest.fn().mockResolvedValue({ canMessage: true, canCall: false });
        const card = await new MemberQueryService(repo, { evaluate }).getCard("u1", "MEMBER", "ws1", "u2");
        expect(evaluate).toHaveBeenCalledWith("u1", "u2");
        expect(card.actions).toMatchObject({ canMessage: true, canCall: false });
      });

      it("bị chặn / không đủ điều kiện (cổng trả false) → cả hai cờ false", async () => {
        seedTarget("u2");
        const evaluate = jest.fn().mockResolvedValue({ canMessage: false, canCall: false });
        const card = await new MemberQueryService(repo, { evaluate }).getCard("u1", "OWNER", "ws1", "u2");
        expect(card.actions).toMatchObject({ canMessage: false, canCall: false, canRemove: true });
      });

      it("chính mình, hoặc người không còn ACTIVE (BANNED) → KHÔNG gọi cổng, cờ false", async () => {
        seedTarget("u1");
        seedTarget("u3", "BANNED");
        const evaluate = jest.fn().mockResolvedValue({ canMessage: true, canCall: true });
        const svc = new MemberQueryService(repo, { evaluate });
        expect((await svc.getCard("u1", "OWNER", "ws1", "u1")).actions).toMatchObject({ canMessage: false, canCall: false });
        expect((await svc.getCard("u1", "OWNER", "ws1", "u3")).actions).toMatchObject({ canMessage: false, canCall: false });
        expect(evaluate).not.toHaveBeenCalled();
      });

      it("cổng ném lỗi → thẻ vẫn trả được, không hứa Nhắn tin/Gọi", async () => {
        seedTarget("u2");
        const evaluate = jest.fn().mockRejectedValue(new Error("db down"));
        const card = await new MemberQueryService(repo, { evaluate }).getCard("u1", "OWNER", "ws1", "u2");
        expect(card.actions).toMatchObject({ canMessage: false, canCall: false });
      });
    });
  });
});

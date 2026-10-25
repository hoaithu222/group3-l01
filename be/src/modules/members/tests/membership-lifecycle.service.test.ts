/**
 * Unit — CHỈ các nhánh throw TRƯỚC KHI chạm `withTransaction()` (bậc quyền,
 * trạng thái actor/target — be.md p1-02 §6 ma trận quyền). Nhánh "happy path"
 * (thật sự update DB) cần Prisma thật → test ở
 * `tests/integration/members.routes.test.ts` (giống tiền lệ `asset.service.test.ts`
 * "chỉ các method KHÔNG chạm `finalize()`").
 */
import { MembershipLifecycleService } from "../services/membership-lifecycle.service";
import { InMemoryMembershipRepository } from "../repositories/membership.repository.inmemory";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { WorkspaceMembership, WorkspaceRoleValue } from "../entities/member.interface";

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

function buildRepoWith(actor?: Partial<WorkspaceMembership>, target?: Partial<WorkspaceMembership>): InMemoryMembershipRepository {
  const repo = new InMemoryMembershipRepository();
  if (actor) repo.seedMembership(makeMembership({ id: "m-actor", userId: "actor", ...actor }));
  if (target) repo.seedMembership(makeMembership({ id: "m-target", userId: "target", ...target }));
  return repo;
}

describe("MembershipLifecycleService — bậc quyền (be.md §6)", () => {
  describe("changeRole()", () => {
    it("actor không có membership → WS_011", async () => {
      const service = new MembershipLifecycleService(buildRepoWith(undefined, { role: "MEMBER" }));
      await expect(service.changeRole("actor", "ws1", "target", "ADMIN")).rejects.toMatchObject({
        statusCode: 403,
        errorCode: ErrorCode.WS_011,
      });
    });

    it("actor không ACTIVE (đã LEFT) → WS_011", async () => {
      const service = new MembershipLifecycleService(
        buildRepoWith({ role: "OWNER", status: "LEFT" }, { role: "MEMBER" })
      );
      await expect(service.changeRole("actor", "ws1", "target", "ADMIN")).rejects.toMatchObject({
        errorCode: ErrorCode.WS_011,
      });
    });

    it("actor ACTIVE nhưng không phải OWNER (vd ADMIN) → WS_011", async () => {
      const service = new MembershipLifecycleService(
        buildRepoWith({ role: "ADMIN", status: "ACTIVE" }, { role: "MEMBER" })
      );
      await expect(service.changeRole("actor", "ws1", "target", "ADMIN")).rejects.toMatchObject({
        errorCode: ErrorCode.WS_011,
      });
    });

    it("target không có membership → WS_013", async () => {
      const service = new MembershipLifecycleService(buildRepoWith({ role: "OWNER", status: "ACTIVE" }, undefined));
      await expect(service.changeRole("actor", "ws1", "target", "ADMIN")).rejects.toMatchObject({
        statusCode: 409,
        errorCode: ErrorCode.WS_013,
      });
    });

    it("target không ACTIVE (đã REMOVED) → WS_013", async () => {
      const service = new MembershipLifecycleService(
        buildRepoWith({ role: "OWNER", status: "ACTIVE" }, { role: "MEMBER", status: "REMOVED" })
      );
      await expect(service.changeRole("actor", "ws1", "target", "ADMIN")).rejects.toMatchObject({
        errorCode: ErrorCode.WS_013,
      });
    });

    it("target là OWNER → WS_010 (không đổi vai trò chủ nhóm)", async () => {
      const service = new MembershipLifecycleService(
        buildRepoWith({ role: "OWNER", status: "ACTIVE" }, { role: "OWNER", status: "ACTIVE" })
      );
      await expect(service.changeRole("actor", "ws1", "target", "MEMBER")).rejects.toMatchObject({
        statusCode: 403,
        errorCode: ErrorCode.WS_010,
      });
    });
  });

  describe("updateDisplayName()", () => {
    it("actor không có membership → WS_011", async () => {
      const service = new MembershipLifecycleService(buildRepoWith(undefined, { role: "MEMBER" }));
      await expect(service.updateDisplayName("actor", "ws1", "target", "Tên mới")).rejects.toMatchObject({
        errorCode: ErrorCode.WS_011,
      });
    });

    it("actor không ACTIVE → WS_011", async () => {
      const service = new MembershipLifecycleService(
        buildRepoWith({ role: "MEMBER", status: "BANNED" }, { role: "MEMBER" })
      );
      await expect(service.updateDisplayName("actor", "ws1", "target", "Tên mới")).rejects.toMatchObject({
        errorCode: ErrorCode.WS_011,
      });
    });

    it("target không có membership → WS_013", async () => {
      const service = new MembershipLifecycleService(buildRepoWith({ role: "MEMBER", status: "ACTIVE" }, undefined));
      await expect(service.updateDisplayName("actor", "ws1", "target", "Tên mới")).rejects.toMatchObject({
        errorCode: ErrorCode.WS_013,
      });
    });

    it("target không ACTIVE → WS_013", async () => {
      const service = new MembershipLifecycleService(
        buildRepoWith({ role: "MEMBER", status: "ACTIVE" }, { role: "MEMBER", status: "LEFT" })
      );
      await expect(service.updateDisplayName("actor", "ws1", "target", "Tên mới")).rejects.toMatchObject({
        errorCode: ErrorCode.WS_013,
      });
    });

    it("MEMBER đổi displayName của MEMBER khác (không phải chính mình, không outrank) → WS_011", async () => {
      const service = new MembershipLifecycleService(
        buildRepoWith({ role: "MEMBER", status: "ACTIVE" }, { role: "MEMBER", status: "ACTIVE" })
      );
      await expect(service.updateDisplayName("actor", "ws1", "target", "Tên mới")).rejects.toMatchObject({
        errorCode: ErrorCode.WS_011,
      });
    });
  });

  describe("revoke() — remove/ban", () => {
    it("actor === target (tự loại chính mình) → WS_012 (kiểm TRƯỚC khi đọc repo)", async () => {
      const service = new MembershipLifecycleService(new InMemoryMembershipRepository());
      await expect(service.revoke("u1", "ws1", "u1", "REMOVED", "Lý do đủ dài 10 ký tự")).rejects.toMatchObject({
        statusCode: 400,
        errorCode: ErrorCode.WS_012,
      });
    });

    it("actor không có membership → WS_011", async () => {
      const service = new MembershipLifecycleService(buildRepoWith(undefined, { role: "MEMBER" }));
      await expect(service.revoke("actor", "ws1", "target", "REMOVED", "Lý do đủ dài 10 ký tự")).rejects.toMatchObject({
        errorCode: ErrorCode.WS_011,
      });
    });

    it("actor không ACTIVE → WS_011", async () => {
      const service = new MembershipLifecycleService(
        buildRepoWith({ role: "ADMIN", status: "LEFT" }, { role: "MEMBER", status: "ACTIVE" })
      );
      await expect(service.revoke("actor", "ws1", "target", "REMOVED", "Lý do đủ dài 10 ký tự")).rejects.toMatchObject({
        errorCode: ErrorCode.WS_011,
      });
    });

    it("target không có membership → WS_013", async () => {
      const service = new MembershipLifecycleService(buildRepoWith({ role: "ADMIN", status: "ACTIVE" }, undefined));
      await expect(service.revoke("actor", "ws1", "target", "REMOVED", "Lý do đủ dài 10 ký tự")).rejects.toMatchObject({
        errorCode: ErrorCode.WS_013,
      });
    });

    it("target không ACTIVE → WS_013", async () => {
      const service = new MembershipLifecycleService(
        buildRepoWith({ role: "ADMIN", status: "ACTIVE" }, { role: "MEMBER", status: "BANNED" })
      );
      await expect(service.revoke("actor", "ws1", "target", "REMOVED", "Lý do đủ dài 10 ký tự")).rejects.toMatchObject({
        errorCode: ErrorCode.WS_013,
      });
    });

    // be.md MB-05 — ADMIN không loại được ADMIN khác; MEMBER không loại được ai.
    const cases: Array<{ actorRole: WorkspaceRoleValue; targetRole: WorkspaceRoleValue }> = [
      { actorRole: "ADMIN", targetRole: "ADMIN" },
      { actorRole: "ADMIN", targetRole: "OWNER" },
      { actorRole: "MEMBER", targetRole: "MEMBER" },
      { actorRole: "MEMBER", targetRole: "ADMIN" },
    ];
    for (const { actorRole, targetRole } of cases) {
      it(`${actorRole} không outrank ${targetRole} → WS_011 (MB-05)`, async () => {
        const service = new MembershipLifecycleService(
          buildRepoWith({ role: actorRole, status: "ACTIVE" }, { role: targetRole, status: "ACTIVE" })
        );
        await expect(
          service.revoke("actor", "ws1", "target", "REMOVED", "Lý do đủ dài 10 ký tự")
        ).rejects.toMatchObject({ statusCode: 403, errorCode: ErrorCode.WS_011 });
      });
    }
  });

  describe("unban()", () => {
    it("actor không có membership → WS_011", async () => {
      const service = new MembershipLifecycleService(buildRepoWith(undefined, { role: "MEMBER", status: "BANNED" }));
      await expect(service.unban("actor", "ws1", "target", "Lý do đủ dài 10 ký tự")).rejects.toMatchObject({
        errorCode: ErrorCode.WS_011,
      });
    });

    it("actor là MEMBER (không phải OWNER/ADMIN) → WS_011", async () => {
      const service = new MembershipLifecycleService(
        buildRepoWith({ role: "MEMBER", status: "ACTIVE" }, { role: "MEMBER", status: "BANNED" })
      );
      await expect(service.unban("actor", "ws1", "target", "Lý do đủ dài 10 ký tự")).rejects.toMatchObject({
        errorCode: ErrorCode.WS_011,
      });
    });

    it("target không có membership → WS_014", async () => {
      const service = new MembershipLifecycleService(buildRepoWith({ role: "ADMIN", status: "ACTIVE" }, undefined));
      await expect(service.unban("actor", "ws1", "target", "Lý do đủ dài 10 ký tự")).rejects.toMatchObject({
        statusCode: 409,
        errorCode: ErrorCode.WS_014,
      });
    });

    it("target không bị BANNED → WS_014", async () => {
      const service = new MembershipLifecycleService(
        buildRepoWith({ role: "ADMIN", status: "ACTIVE" }, { role: "MEMBER", status: "ACTIVE" })
      );
      await expect(service.unban("actor", "ws1", "target", "Lý do đủ dài 10 ký tự")).rejects.toMatchObject({
        errorCode: ErrorCode.WS_014,
      });
    });
  });

  describe("platformRevoke()", () => {
    it("target không có membership → WS_013", async () => {
      const service = new MembershipLifecycleService(buildRepoWith(undefined, undefined));
      await expect(
        service.platformRevoke("admin1", "ws1", "target", "Lý do đủ dài 10 ký tự", false)
      ).rejects.toMatchObject({ statusCode: 409, errorCode: ErrorCode.WS_013 });
    });

    it("target không ACTIVE → WS_013", async () => {
      const repo = new InMemoryMembershipRepository();
      repo.seedMembership(makeMembership({ id: "m-target", userId: "target", role: "MEMBER", status: "REMOVED" }));
      const service = new MembershipLifecycleService(repo);
      await expect(
        service.platformRevoke("admin1", "ws1", "target", "Lý do đủ dài 10 ký tự", false)
      ).rejects.toMatchObject({ errorCode: ErrorCode.WS_013 });
    });

    it("target là OWNER → WS_015 (không thu hồi chủ nhóm cấp nền tảng)", async () => {
      const repo = new InMemoryMembershipRepository();
      repo.seedMembership(makeMembership({ id: "m-target", userId: "target", role: "OWNER", status: "ACTIVE" }));
      const service = new MembershipLifecycleService(repo);
      await expect(
        service.platformRevoke("admin1", "ws1", "target", "Lý do đủ dài 10 ký tự", true)
      ).rejects.toMatchObject({ statusCode: 409, errorCode: ErrorCode.WS_015 });
    });
  });
});

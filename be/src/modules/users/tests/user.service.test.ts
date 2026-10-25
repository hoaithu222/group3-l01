const mockDisconnectUserSockets = jest.fn();
jest.mock("../../../infrastructure/socket", () => ({
  disconnectUserSockets: (...args: unknown[]) => mockDisconnectUserSockets(...args),
}));

import { UserService } from "../services/user.service";
import type { SessionManager, AuditRecorder } from "../services/user.service";
import type { UserAnonymizer } from "../services/user-anonymizer";
import { InMemoryUserRepository } from "../repositories/user.repository.inmemory";
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  SelfAnonymizeForbiddenError,
  AnonymizeNowForbiddenError,
  ConfirmEmailMismatchError,
} from "../../../core/exceptions";

describe("UserService", () => {
  let userService: UserService;
  let userRepo: InMemoryUserRepository;

  beforeEach(() => {
    InMemoryUserRepository.clearStore();
    userRepo = new InMemoryUserRepository();
    userService = new UserService(userRepo);
  });

  // ─── create ──────────────────────────────────────────────────────────────────
  describe("create()", () => {
    it("tạo user mới thành công", async () => {
      const user = await userService.create({
        email: "new@example.com",
        name: "New User",
        passwordHash: "hashed",
      });

      expect(user.id).toBeDefined();
      expect(user.email).toBe("new@example.com");
      expect(user.name).toBe("New User");
      // passwordHash phải bị ẩn
      expect("passwordHash" in user && user.passwordHash).toBeFalsy();
    });

    it("ném ConflictError khi email đã tồn tại", async () => {
      await userService.create({ email: "dup@example.com", name: "A", passwordHash: "h" });

      await expect(
        userService.create({ email: "dup@example.com", name: "B", passwordHash: "h" })
      ).rejects.toThrow(ConflictError);
    });
  });

  // ─── getById ─────────────────────────────────────────────────────────────────
  describe("getById()", () => {
    it("trả về user khi tìm thấy", async () => {
      const created = await userService.create({
        email: "find@example.com",
        name: "Find Me",
        passwordHash: "h",
      });

      const found = await userService.getById(created.id);

      expect(found.email).toBe("find@example.com");
    });

    it("ném NotFoundError khi id không tồn tại", async () => {
      await expect(userService.getById("non-existent-id")).rejects.toThrow(NotFoundError);
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────
  describe("update()", () => {
    it("cập nhật tên user thành công", async () => {
      const created = await userService.create({
        email: "update@example.com",
        name: "Old Name",
        passwordHash: "h",
      });

      const updated = await userService.update(created.id, { name: "New Name" });

      expect(updated.name).toBe("New Name");
    });

    it("ném NotFoundError khi update user không tồn tại", async () => {
      await expect(userService.update("nobody", { name: "X" })).rejects.toThrow(NotFoundError);
    });
  });

  // ─── delete ──────────────────────────────────────────────────────────────────
  describe("delete()", () => {
    it("xoá user thành công", async () => {
      const created = await userService.create({
        email: "del@example.com",
        name: "Delete Me",
        passwordHash: "h",
      });

      await expect(userService.delete(created.id)).resolves.not.toThrow();

      await expect(userService.getById(created.id)).rejects.toThrow(NotFoundError);
    });

    it("ném NotFoundError khi xoá user không tồn tại", async () => {
      await expect(userService.delete("fake-id")).rejects.toThrow(NotFoundError);
    });
  });

  // ─── getMany ─────────────────────────────────────────────────────────────────
  describe("getMany()", () => {
    it("trả về danh sách phân trang", async () => {
      await userService.create({ email: "a@e.com", name: "A", passwordHash: "h" });
      await userService.create({ email: "b@e.com", name: "B", passwordHash: "h" });
      await userService.create({ email: "c@e.com", name: "C", passwordHash: "h" });

      const { data, total } = await userService.getMany(1, 2);

      expect(total).toBe(3);
      expect(data).toHaveLength(2);
    });
  });

  // ─── lock/unlock/changeRole ────────────────────────────────────────────────
  describe("lock() / unlock() / changeRole()", () => {
    let sessions: SessionManager & { revokeAll: jest.Mock };
    let audit: AuditRecorder & { record: jest.Mock };
    let svc: UserService;

    beforeEach(() => {
      sessions = {
        revokeAll: jest.fn().mockResolvedValue(undefined),
        listActive: jest.fn().mockResolvedValue([]),
        revoke: jest.fn().mockResolvedValue(undefined),
      };
      audit = { record: jest.fn().mockResolvedValue(undefined) };
      svc = new UserService(userRepo, sessions, audit);
    });

    it("lock() đổi status, thu hồi session, ghi audit", async () => {
      const user = await svc.create({ email: "lock@e.com", name: "Lock Me", passwordHash: "h" });

      const result = await svc.lock(user.id, "actor-1", "Vi phạm điều khoản sử dụng");

      expect(result.status).toBe("LOCKED");
      expect(sessions.revokeAll).toHaveBeenCalledWith(user.id, "ACCOUNT_LOCKED");
      expect(mockDisconnectUserSockets).toHaveBeenCalledWith(user.id, "account-locked");
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: "actor-1", action: "user.lock", targetId: user.id })
      );
    });

    it("unlock() trả status về ACTIVE", async () => {
      const user = await svc.create({
        email: "unlock@e.com",
        name: "Unlock Me",
        passwordHash: "h",
      });
      await svc.lock(user.id, "actor-1", "Vi phạm điều khoản sử dụng");

      const result = await svc.unlock(user.id, "actor-1", "Đã xác minh lại danh tính");

      expect(result.status).toBe("ACTIVE");
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "user.unlock" }));
    });

    it("changeRole() đổi role, thu hồi session vì token cũ mang role cũ", async () => {
      const user = await svc.create({ email: "role@e.com", name: "Role Me", passwordHash: "h" });

      const result = await svc.changeRole(user.id, "manager", "actor-1", "Thăng chức quản lý");

      expect(result.role).toBe("manager");
      expect(sessions.revokeAll).toHaveBeenCalledWith(user.id);
      // Socket đang mở mang vai trò cũ (đã qua handshake) ⇒ phải bị ngắt, giống nhánh PATCH /users/:id (SEC-04).
      expect(mockDisconnectUserSockets).toHaveBeenCalledWith(user.id, "role-changed");
    });

    it("changeRole() ném ValidationError khi tự đổi role của chính mình", async () => {
      const user = await svc.create({ email: "self@e.com", name: "Self", passwordHash: "h" });

      await expect(svc.changeRole(user.id, "admin", user.id, "Tự thăng chức")).rejects.toThrow(
        ValidationError
      );
      expect(sessions.revokeAll).not.toHaveBeenCalled();
      expect(mockDisconnectUserSockets).not.toHaveBeenCalled();
    });

    it("lock() ném NotFoundError khi user không tồn tại", async () => {
      await expect(svc.lock("nobody", "actor-1", "Lý do bất kỳ")).rejects.toThrow(NotFoundError);
    });
  });

  // ─── updatePrivacy() ─────────────────────────────────────────────────────
  describe("updatePrivacy()", () => {
    it("merge patch với mặc định (mọi trường privacy = true) khi user chưa có privacy", async () => {
      const user = await userService.create({ email: "priv@e.com", name: "P", passwordHash: "h" });

      const result = await userService.updatePrivacy(user.id, { showPresence: false });

      expect(result).toEqual({
        readReceipts: true,
        showPresence: false,
        showInLeaderboard: true,
        showGamification: true,
        findableByEmail: true,
        findableByPhone: true,
      });
    });

    it("merge patch với privacy hiện có (không ghi đè field không gửi)", async () => {
      const user = await userService.create({ email: "priv2@e.com", name: "P2", passwordHash: "h" });
      await userService.updatePrivacy(user.id, { readReceipts: false, showPresence: false });

      const result = await userService.updatePrivacy(user.id, { readReceipts: true });

      expect(result).toEqual({
        readReceipts: true,
        showPresence: false,
        showInLeaderboard: true,
        showGamification: true,
        findableByEmail: true,
        findableByPhone: true,
      });
    });

    it("findableByEmail/findableByPhone: vá từng cờ, giữ nguyên các trường khác (vắng ≡ cho phép tìm)", async () => {
      const user = await userService.create({ email: "priv3@e.com", name: "P3", passwordHash: "h" });

      const afterEmail = await userService.updatePrivacy(user.id, { findableByEmail: false });
      expect(afterEmail).toEqual({
        readReceipts: true,
        showPresence: true,
        showInLeaderboard: true,
        showGamification: true,
        findableByEmail: false,
        findableByPhone: true,
      });

      const afterPhone = await userService.updatePrivacy(user.id, { findableByPhone: false });
      expect(afterPhone).toMatchObject({ findableByEmail: false, findableByPhone: false, readReceipts: true });

      const restored = await userService.updatePrivacy(user.id, { findableByEmail: true });
      expect(restored).toMatchObject({ findableByEmail: true, findableByPhone: false });
    });

    it("ném NotFoundError khi user không tồn tại", async () => {
      await expect(userService.updatePrivacy("nobody", { readReceipts: false })).rejects.toThrow(
        NotFoundError
      );
    });
  });

  // ─── anonymizeAdmin() — chỉ phần không đụng Prisma thật (guard clauses + mode NOW) ──
  describe("anonymizeAdmin() (mode NOW, guard clauses)", () => {
    let svc: UserService;
    let audit: AuditRecorder & { record: jest.Mock };
    let anonymizer: UserAnonymizer & { anonymize: jest.Mock };

    beforeEach(() => {
      audit = { record: jest.fn().mockResolvedValue(undefined) };
      anonymizer = { anonymize: jest.fn().mockResolvedValue(new Date("2026-01-01T00:00:00Z")) } as unknown as UserAnonymizer & {
        anonymize: jest.Mock;
      };
      svc = new UserService(userRepo, undefined, audit, anonymizer);
    });

    it("ném SelfAnonymizeForbiddenError khi admin nhắm vào chính mình", async () => {
      await expect(
        svc.anonymizeAdmin("actor-1", { id: "actor-1", role: "admin" }, {
          mode: "GRACE",
          reason: "vi phạm nghiêm trọng",
        })
      ).rejects.toThrow(SelfAnonymizeForbiddenError);
      expect(anonymizer.anonymize).not.toHaveBeenCalled();
    });

    it("ném NotFoundError khi target không tồn tại", async () => {
      await expect(
        svc.anonymizeAdmin("nobody", { id: "actor-1", role: "admin" }, {
          mode: "NOW",
          reason: "vi phạm nghiêm trọng",
          confirmEmail: "x@e.com",
        })
      ).rejects.toThrow(NotFoundError);
    });

    it("mode NOW + actor không phải admin → AnonymizeNowForbiddenError", async () => {
      const target = await userService.create({ email: "now1@e.com", name: "T", passwordHash: "h" });

      await expect(
        svc.anonymizeAdmin(target.id, { id: "actor-1", role: "manager" }, {
          mode: "NOW",
          reason: "vi phạm nghiêm trọng",
          confirmEmail: target.email,
        })
      ).rejects.toThrow(AnonymizeNowForbiddenError);
      expect(anonymizer.anonymize).not.toHaveBeenCalled();
    });

    it("mode NOW + confirmEmail sai → ConfirmEmailMismatchError", async () => {
      const target = await userService.create({ email: "now2@e.com", name: "T", passwordHash: "h" });

      await expect(
        svc.anonymizeAdmin(target.id, { id: "actor-1", role: "admin" }, {
          mode: "NOW",
          reason: "vi phạm nghiêm trọng",
          confirmEmail: "khong-khop@e.com",
        })
      ).rejects.toThrow(ConfirmEmailMismatchError);
      expect(anonymizer.anonymize).not.toHaveBeenCalled();
    });

    it("mode NOW + admin + confirmEmail đúng → gọi anonymizer, ghi audit, trả ANONYMIZED", async () => {
      const target = await userService.create({ email: "now3@e.com", name: "T", passwordHash: "h" });

      const result = await svc.anonymizeAdmin(target.id, { id: "actor-1", role: "admin" }, {
        mode: "NOW",
        reason: "vi phạm nghiêm trọng",
        confirmEmail: target.email,
      });

      expect(result.status).toBe("ANONYMIZED");
      expect(result.anonymizedAt).toEqual(new Date("2026-01-01T00:00:00Z"));
      expect(anonymizer.anonymize).toHaveBeenCalledWith(target.id);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "user.anonymize", targetId: target.id })
      );
    });
  });
});

// ── Bổ sung (rà soát auth BE 2026-09-25) ──────────────────────────────────────────────────────────────
describe("UserService — khoá tài khoản, phiên và cập nhật hồ sơ (unit, repo in-memory)", () => {
  let userRepo: InMemoryUserRepository;
  let sessions: SessionManager & { revokeAll: jest.Mock; listActive: jest.Mock; revoke: jest.Mock };
  let audit: AuditRecorder & { record: jest.Mock };
  let svc: UserService;

  beforeEach(() => {
    InMemoryUserRepository.clearStore();
    userRepo = new InMemoryUserRepository();
    sessions = {
      revokeAll: jest.fn().mockResolvedValue(0),
      listActive: jest.fn().mockResolvedValue([]),
      revoke: jest.fn().mockResolvedValue(undefined),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    svc = new UserService(userRepo, sessions, audit);
  });

  describe("lock()/unlock() chỉ đổi ACTIVE ⇄ LOCKED (PENDING_DELETION/ANONYMIZED có vòng đời riêng)", () => {
    it.each(["ANONYMIZED", "PENDING_DELETION"])("unlock() tài khoản %s ⇒ ConflictError, KHÔNG đổi status/phiên/audit", async (status) => {
      const admin = await svc.create({ email: "admin-l@e.com", name: "Admin", passwordHash: "h", role: "admin" });
      const target = await svc.create({ email: `target-${status}@e.com`, name: "Target", passwordHash: "h" });
      await userRepo.setStatus(target.id, status);

      await expect(svc.unlock(target.id, admin.id, "Thử mở khoá tài khoản")).rejects.toThrow(ConflictError);

      expect((await userRepo.findById(target.id))?.status).toBe(status);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it.each(["ANONYMIZED", "PENDING_DELETION"])("lock() tài khoản %s ⇒ ConflictError (không chặn đứng job ẩn danh hoá), không thu hồi phiên", async (status) => {
      const admin = await svc.create({ email: "admin-k@e.com", name: "Admin", passwordHash: "h", role: "admin" });
      const target = await svc.create({ email: `target-k-${status}@e.com`, name: "Target", passwordHash: "h" });
      await userRepo.setStatus(target.id, status);

      await expect(svc.lock(target.id, admin.id, "Thử khoá tài khoản")).rejects.toThrow(ConflictError);

      expect((await userRepo.findById(target.id))?.status).toBe(status);
      expect(sessions.revokeAll).not.toHaveBeenCalled();
    });

    it("ACTIVE → LOCKED → ACTIVE vẫn chạy bình thường; khoá lại tài khoản đã khoá là idempotent; user không tồn tại ⇒ NotFoundError", async () => {
      const admin = await svc.create({ email: "admin-m@e.com", name: "Admin", passwordHash: "h", role: "admin" });
      const target = await svc.create({ email: "target-m@e.com", name: "Target", passwordHash: "h" });

      expect((await svc.lock(target.id, admin.id, "Khoá lần một ở đây")).status).toBe("LOCKED");
      expect((await svc.lock(target.id, admin.id, "Khoá lần hai ở đây")).status).toBe("LOCKED");
      expect((await svc.unlock(target.id, admin.id, "Mở khoá lại tài khoản")).status).toBe("ACTIVE");
      await expect(svc.unlock("nobody", admin.id, "Không có ai cả")).rejects.toThrow(NotFoundError);
    });
  });

  it("lock(): không cho tự khoá tài khoản của chính mình (mất quyền quản trị duy nhất)", async () => {
    const admin = await svc.create({ email: "admin@e.com", name: "Admin", passwordHash: "h", role: "admin" });

    await expect(svc.lock(admin.id, admin.id, "Tự khoá thử nghiệm")).rejects.toThrow(ValidationError);

    expect((await userRepo.findById(admin.id))?.status).toBe("ACTIVE");
    expect(sessions.revokeAll).not.toHaveBeenCalled();
  });

  describe("update()", () => {
    async function seed() {
      const actor = await svc.create({ email: "actor@e.com", name: "Actor", passwordHash: "h", role: "admin" });
      const target = await svc.create({ email: "target@e.com", name: "Target", passwordHash: "h", role: "user" });
      return { actor, target };
    }

    it("chỉ đổi tên ⇒ KHÔNG thu hồi phiên, KHÔNG ghi audit", async () => {
      const { actor, target } = await seed();

      await svc.update(target.id, { name: "Tên Mới" }, { id: actor.id, role: "admin" });

      expect(sessions.revokeAll).not.toHaveBeenCalled();
      expect(mockDisconnectUserSockets).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("đổi vai trò ⇒ thu hồi phiên + audit user.update (kèm vai trò mới)", async () => {
      const { actor, target } = await seed();

      const updated = await svc.update(target.id, { role: "manager" }, { id: actor.id, role: "admin" });

      expect(updated.role).toBe("manager");
      expect(sessions.revokeAll).toHaveBeenCalledWith(target.id, "SESSIONS_REVOKED");
      expect(mockDisconnectUserSockets).toHaveBeenCalledWith(target.id, "credentials-changed");
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: actor.id,
          action: "user.update",
          targetId: target.id,
          metadata: expect.objectContaining({ fields: ["role"], role: "manager" }),
        })
      );
    });

    it("đặt lại vai trò như cũ ⇒ không phải thay đổi (không thu hồi phiên)", async () => {
      const { actor, target } = await seed();

      await svc.update(target.id, { role: "user" }, { id: actor.id, role: "admin" });

      expect(sessions.revokeAll).not.toHaveBeenCalled();
    });

    it("tự đổi vai trò của chính mình qua PATCH ⇒ ValidationError, không ghi gì", async () => {
      const { actor } = await seed();

      await expect(svc.update(actor.id, { role: "user" }, { id: actor.id, role: "admin" })).rejects.toThrow(
        ValidationError
      );
      expect((await userRepo.findById(actor.id))?.role).toBe("admin");
      expect(sessions.revokeAll).not.toHaveBeenCalled();
    });

    it("đổi mật khẩu ⇒ lưu HASH (không lưu mật khẩu thô), thu hồi phiên với lý do PASSWORD_CHANGED", async () => {
      const { actor, target } = await seed();

      await svc.update(target.id, { password: "Mat-khau-moi-12345" }, { id: actor.id, role: "admin" });

      const stored = await userRepo.findById(target.id);
      expect(stored?.passwordHash).toBeDefined();
      expect(stored?.passwordHash).not.toBe("Mat-khau-moi-12345");
      expect(stored?.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(sessions.revokeAll).toHaveBeenCalledWith(target.id, "PASSWORD_CHANGED");
    });

    it("đổi email ⇒ chuẩn hoá chữ thường, email mới chưa xác minh, thu hồi phiên; email đã có người dùng ⇒ ConflictError", async () => {
      const { actor, target } = await seed();
      await svc.create({ email: "da.co@e.com", name: "Da Co", passwordHash: "h" });

      await expect(
        svc.update(target.id, { email: "DA.CO@e.com" }, { id: actor.id, role: "admin" })
      ).rejects.toThrow(ConflictError);
      expect(sessions.revokeAll).not.toHaveBeenCalled();

      const updated = await svc.update(target.id, { email: " Moi@E.COM " }, { id: actor.id, role: "admin" });

      expect(updated.email).toBe("moi@e.com");
      expect(updated.emailVerified).toBe(false);
      expect(sessions.revokeAll).toHaveBeenCalledTimes(1);
    });

    it("không có `actor` (gọi nội bộ) vẫn đổi được vai trò; ném NotFoundError khi user không tồn tại", async () => {
      const { target } = await seed();

      await expect(svc.update(target.id, { role: "manager" })).resolves.toMatchObject({ role: "manager" });
      await expect(svc.update("nobody", { name: "X" })).rejects.toThrow(NotFoundError);
    });
  });

  describe("phiên đăng nhập", () => {
    const sessionRows = [
      { id: "s1", userAgent: "UA", ipAddress: "1.1.1.1", createdAt: new Date(), lastUsedAt: new Date(), isCurrent: false, deviceId: "device-abcdef123456" },
      { id: "s2", userAgent: null, ipAddress: null, createdAt: new Date(), lastUsedAt: new Date(), isCurrent: false, deviceId: null },
    ];

    it("chính chủ xem phiên của mình: deviceId ĐẦY ĐỦ", async () => {
      sessions.listActive.mockResolvedValue(sessionRows);

      const list = await svc.listSessions("u1", { sessionId: "s1" }, true);

      expect(list[0]?.deviceId).toBe("device-abcdef123456");
      expect(list[0]).not.toHaveProperty("deviceIdMasked");
      expect(sessions.listActive).toHaveBeenCalledWith("u1", { sessionId: "s1" });
    });

    it("quản trị viên xem phiên của người khác: KHÔNG có deviceId, chỉ deviceIdMasked (6 ký tự cuối)", async () => {
      sessions.listActive.mockResolvedValue(sessionRows);

      const list = await svc.listSessions("u1", undefined, false);

      expect(list[0]).not.toHaveProperty("deviceId");
      expect(list[0]?.deviceIdMasked).toBe("••••123456");
      expect(list[1]?.deviceIdMasked).toBeNull();
      expect(JSON.stringify(list)).not.toContain("device-abcdef123456");
    });

    it("revokeSession(): thu hồi + ghi audit auth.session-revoke (người thao tác, IP, sessionId)", async () => {
      await svc.revokeSession("s9", "u1", { sessionId: "s1" }, { id: "admin-1", role: "admin", ip: "9.9.9.9", userAgent: "UA" });

      expect(sessions.revoke).toHaveBeenCalledWith("s9", "u1", { sessionId: "s1" });
      expect(mockDisconnectUserSockets).toHaveBeenCalledWith("u1", "session-revoked");
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "admin-1",
          action: "auth.session-revoke",
          targetType: "User",
          targetId: "u1",
          ip: "9.9.9.9",
          metadata: { sessionId: "s9" },
        })
      );
    });
  });
});

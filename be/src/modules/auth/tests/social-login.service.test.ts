import bcrypt from "bcryptjs";
import { SocialLoginService, MAX_AUTH_AGE_SECONDS } from "../services/social-login.service";
import { TokenIssuer } from "../services/token-issuer";
import type { SessionService } from "../services/session.service";
import { InMemoryUserRepository } from "../../users/repositories/user.repository.inmemory";
import { AccountLockedError, ConflictError, UnauthorizedError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { mailService } from "../../../infrastructure/mail";
import type { FirebaseIdentity, IFirebaseIdentityVerifier } from "../../../infrastructure/firebase";

jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), ping: jest.fn() },
}));
jest.mock("../../../infrastructure/mail", () => ({
  mailService: { sendWelcome: jest.fn(), sendNewDeviceLogin: jest.fn() },
}));

const NOW = Date.UTC(2026, 8, 26, 12, 0, 0);
const EMAIL = "google.user@gmail.com";

function identity(over: Partial<FirebaseIdentity> = {}): FirebaseIdentity {
  return {
    uid: "fb-uid-1",
    email: EMAIL,
    emailVerified: true,
    name: "Google User",
    provider: "google.com",
    authTime: Math.floor(NOW / 1000) - 10,
    ...over,
  };
}

function fakeSessions() {
  return {
    create: jest.fn().mockResolvedValue(undefined),
    revokeAll: jest.fn().mockResolvedValue(1),
    isKnownDevice: jest.fn().mockResolvedValue(true),
    enforceSessionsMax: jest.fn().mockResolvedValue(undefined),
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup(id: FirebaseIdentity | Error = identity()) {
  const repo = new InMemoryUserRepository();
  const sessions = fakeSessions();
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const verifier: IFirebaseIdentityVerifier = {
    verify: jest.fn().mockImplementation(async () => {
      if (id instanceof Error) throw id;
      return id;
    }),
  };
  const svc = new SocialLoginService(
    repo,
    new TokenIssuer(sessions as unknown as SessionService),
    sessions as unknown as SessionService,
    { verifier, audit, now: () => NOW }
  );
  return { repo, sessions, audit, verifier, svc };
}

describe("SocialLoginService", () => {
  beforeEach(() => InMemoryUserRepository.clearStore());

  describe("tài khoản mới", () => {
    it("tạo user (role user, email đã xác minh, không mật khẩu) và cấp token", async () => {
      const { svc, repo } = setup();
      const result = await svc.login("id-token");

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      const user = await repo.findByEmail(EMAIL);
      expect(user).toMatchObject({ email: EMAIL, name: "Google User", role: "user", emailVerified: true });
      expect(user?.passwordHash).toBeUndefined();
      expect(result.user.email).toBe(EMAIL);
    });

    it("gửi email chào mừng, không cảnh báo thiết bị mới, phiên ghi authMethod SOCIAL", async () => {
      const { svc, sessions } = setup();
      await svc.login("id-token", { deviceId: "dev-1", notifyNewDevice: true });
      await flush();

      expect(mailService.sendWelcome).toHaveBeenCalledWith(EMAIL, "Google User");
      expect(sessions.isKnownDevice).not.toHaveBeenCalled();
      expect(sessions.create).toHaveBeenCalledWith(expect.objectContaining({ authMethod: "SOCIAL", deviceId: "dev-1" }));
    });

    it("email chuẩn hoá chữ thường dù nhà cung cấp trả chữ hoa", async () => {
      const { svc, repo } = setup(identity({ email: "Google.User@Gmail.COM" }));
      await svc.login("id-token");
      expect(await repo.findByEmail(EMAIL)).not.toBeNull();
    });

    it("tên: bỏ thẻ HTML/ký tự điều khiển, cắt 80 ký tự; rỗng ⇒ phần trước @", async () => {
      const dirty = setup(identity({ name: "  <script>alert(1)</script>Nguyễn\u0007 Văn A " }));
      const a = await dirty.svc.login("t");
      expect(a.user.name).not.toMatch(/[<>]/);
      expect(a.user.name).not.toContain("\u0007");
      expect(a.user.name).toContain("Nguyễn");

      InMemoryUserRepository.clearStore();
      const long = setup(identity({ name: "x".repeat(200) }));
      expect((await long.svc.login("t")).user.name).toHaveLength(80);

      InMemoryUserRepository.clearStore();
      const empty = setup(identity({ name: null }));
      expect((await empty.svc.login("t")).user.name).toBe("google.user");
    });

    it("hai lượt đầu tiên đồng thời: create trùng email ⇒ dùng tài khoản của bên thắng, không lỗi", async () => {
      const { svc, repo } = setup();
      const winner = await repo.create({ email: EMAIL, name: "Winner", role: "user", emailVerified: true });
      jest.spyOn(repo, "findByEmail").mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
      jest.spyOn(repo, "create").mockRejectedValueOnce(new ConflictError("Email đã tồn tại"));

      const result = await svc.login("id-token");
      expect(result.user.id).toBe(winner.id);
    });
  });

  describe("tài khoản có sẵn", () => {
    it("email ĐÃ xác minh ⇒ vào đúng tài khoản đó, mật khẩu cũ giữ nguyên, không thu hồi phiên", async () => {
      const { svc, repo, sessions } = setup();
      const hash = await bcrypt.hash("old-password", 4);
      const existing = await repo.create({ email: EMAIL, name: "Có sẵn", passwordHash: hash, role: "user", emailVerified: true });

      const result = await svc.login("id-token", { notifyNewDevice: true });

      expect(result.user.id).toBe(existing.id);
      expect((await repo.findById(existing.id))?.passwordHash).toBe(hash);
      expect(sessions.revokeAll).not.toHaveBeenCalled();
      expect(sessions.isKnownDevice).toHaveBeenCalled(); // tài khoản cũ ⇒ vẫn cảnh báo thiết bị mới
      expect(mailService.sendWelcome).not.toHaveBeenCalled();
    });

    it("email khác hoa/thường vẫn khớp tài khoản có sẵn (không tạo bản trùng)", async () => {
      const { svc, repo } = setup(identity({ email: "GOOGLE.USER@gmail.com" }));
      const existing = await repo.create({ email: EMAIL, name: "A", role: "user", emailVerified: true });
      expect((await svc.login("t")).user.id).toBe(existing.id);
    });

    it("email CHƯA xác minh ⇒ mật khẩu cũ bị vô hiệu, thu hồi MỌI phiên, rồi đánh dấu đã xác minh (chống chiếm chỗ)", async () => {
      const { svc, repo, sessions, audit } = setup();
      const attackerHash = await bcrypt.hash("attacker-password", 4);
      const squatted = await repo.create({ email: EMAIL, name: "Kẻ đăng ký trước", passwordHash: attackerHash, role: "user" });
      expect(squatted.emailVerified).toBe(false);

      const result = await svc.login("id-token");
      await flush();

      const after = await repo.findById(squatted.id);
      expect(result.user.id).toBe(squatted.id);
      expect(after?.emailVerified).toBe(true);
      expect(after?.passwordHash).not.toBe(attackerHash);
      expect(await bcrypt.compare("attacker-password", after!.passwordHash!)).toBe(false);
      expect(sessions.revokeAll).toHaveBeenCalledWith(squatted.id, "PASSWORD_RESET");
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "auth.social-login",
          targetId: squatted.id,
          metadata: { provider: "google.com", created: false, passwordInvalidated: true },
        })
      );
    });

    it("thu hồi phiên lỗi ⇒ KHÔNG đánh dấu đã xác minh (lượt sau chạy lại từ đầu) và không cấp token", async () => {
      const { svc, repo, sessions } = setup();
      const u = await repo.create({ email: EMAIL, name: "X", passwordHash: "h", role: "user" });
      sessions.revokeAll.mockRejectedValueOnce(new Error("db down"));

      await expect(svc.login("id-token")).rejects.toThrow("db down");
      expect((await repo.findById(u.id))?.emailVerified).toBe(false);
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it("tài khoản bị khoá ⇒ AUTH_011; chờ xoá ⇒ AUTH_012 (kiểm sau khi danh tính đã được chứng minh)", async () => {
      const { svc, repo } = setup();
      const u = await repo.create({ email: EMAIL, name: "X", role: "user", emailVerified: true });

      await repo.setStatus(u.id, "LOCKED");
      await expect(svc.login("t")).rejects.toMatchObject({ errorCode: ErrorCode.AUTH_011 });
      await expect(svc.login("t")).rejects.toBeInstanceOf(AccountLockedError);

      await repo.setStatus(u.id, "PENDING_DELETION");
      await expect(svc.login("t")).rejects.toMatchObject({ errorCode: ErrorCode.AUTH_012 });
    });
  });

  describe("từ chối danh tính không đủ điều kiện", () => {
    it.each([
      ["email chưa xác minh", { emailVerified: false }],
      ["không có email", { email: null }],
      ["nhà cung cấp password", { provider: "password" }],
      ["nhà cung cấp ẩn danh", { provider: "anonymous" }],
      ["nhà cung cấp chưa hỗ trợ (apple.com)", { provider: "apple.com" }],
    ] as Array<[string, Partial<FirebaseIdentity>]>)("%s ⇒ 401 AUTH_023, không tạo user", async (_label, over) => {
      const { svc, repo } = setup(identity(over));
      await expect(svc.login("t")).rejects.toMatchObject({ statusCode: 401, errorCode: ErrorCode.AUTH_023 });
      expect((await repo.findMany(10, 0)).total).toBe(0);
    });

    it("đăng nhập Google quá cũ (auth_time > 5 phút) ⇒ 401 AUTH_022", async () => {
      const stale = identity({ authTime: Math.floor(NOW / 1000) - MAX_AUTH_AGE_SECONDS - 1 });
      const { svc, repo } = setup(stale);
      await expect(svc.login("t")).rejects.toMatchObject({ statusCode: 401, errorCode: ErrorCode.AUTH_022 });
      expect((await repo.findMany(10, 0)).total).toBe(0);
    });

    it("đúng mốc 5 phút vẫn được nhận; thiếu/NaN auth_time bị từ chối", async () => {
      const edge = setup(identity({ authTime: Math.floor(NOW / 1000) - MAX_AUTH_AGE_SECONDS }));
      await expect(edge.svc.login("t")).resolves.toBeTruthy();

      InMemoryUserRepository.clearStore();
      const nan = setup(identity({ authTime: Number.NaN }));
      await expect(nan.svc.login("t")).rejects.toMatchObject({ errorCode: ErrorCode.AUTH_022 });
    });

    it("lỗi của verifier (token sai/hết hạn/503) được truyền nguyên vẹn", async () => {
      const bad = new UnauthorizedError("Token sai", ErrorCode.AUTH_022);
      const { svc } = setup(bad);
      await expect(svc.login("t")).rejects.toBe(bad);
    });
  });
});

import { AuthService } from "../services/auth.service";
import { InMemoryUserRepository } from "../../users/repositories/user.repository.inmemory";
import { UnauthorizedError, ConflictError } from "../../../core/exceptions";

// Mock các dependency bên ngoài
jest.mock("../../../infrastructure/redis", () => ({
  redis: {
    connect: jest.fn().mockResolvedValue({
      set: jest.fn().mockResolvedValue("OK"),
      get: jest.fn().mockResolvedValue(null),
      setEx: jest.fn().mockResolvedValue("OK"),
      del: jest.fn().mockResolvedValue(1),
    }),
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock("../../../infrastructure/mail", () => ({
  mailService: {
    sendWelcome: jest.fn().mockResolvedValue(undefined),
    sendResetPassword: jest.fn().mockResolvedValue(undefined),
  },
}));

describe("AuthService", () => {
  let authService: AuthService;
  let userRepo: InMemoryUserRepository;

  beforeEach(() => {
    // Reset in-memory store trước mỗi test
    InMemoryUserRepository.clearStore();
    userRepo = new InMemoryUserRepository();
    authService = new AuthService(userRepo);
  });

  // ─── register ───────────────────────────────────────────────────────────────
  describe("register()", () => {
    it("đăng ký thành công với email mới", async () => {
      const result = await authService.register("test@example.com", "Nguyen Van A", "password123");

      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      expect(result.user.email).toBe("test@example.com");
      expect(result.user.name).toBe("Nguyen Van A");
    });

    it("lưu số điện thoại tự khai (đã chuẩn hoá) và trả lại cho chính người đó; không truyền ⇒ null", async () => {
      const withPhone = await authService.register("p1@example.com", "Có SĐT", "password123", undefined, "+84912345678");
      const without = await authService.register("p2@example.com", "Không SĐT", "password123");

      expect(withPhone.user.phone).toBe("+84912345678");
      expect((await userRepo.findByEmail("p1@example.com"))?.phone).toBe("+84912345678");
      expect(without.user.phone).toBeNull();
    });

    it("ném ConflictError khi email đã tồn tại", async () => {
      await authService.register("duplicate@example.com", "User A", "pass123");

      await expect(
        authService.register("duplicate@example.com", "User B", "pass456")
      ).rejects.toThrow(ConflictError);
    });
  });

  // ─── login ───────────────────────────────────────────────────────────────────
  describe("login()", () => {
    it("đăng nhập thành công với credentials đúng", async () => {
      await authService.register("login@example.com", "Test User", "correctPass");

      const result = await authService.login("login@example.com", "correctPass");

      expect(result).toHaveProperty("accessToken");
      expect(result.user.email).toBe("login@example.com");
    });

    it("ném UnauthorizedError khi mật khẩu sai", async () => {
      await authService.register("wrong@example.com", "Test User", "correctPass");

      await expect(authService.login("wrong@example.com", "wrongPass")).rejects.toThrow(
        UnauthorizedError
      );
    });

    it("ném UnauthorizedError khi email không tồn tại", async () => {
      await expect(authService.login("notexist@example.com", "anypass")).rejects.toThrow(
        UnauthorizedError
      );
    });
  });

  // ─── logout ──────────────────────────────────────────────────────────────────
  describe("logout()", () => {
    it("blacklist token thành công (không ném lỗi)", async () => {
      const { accessToken } = await authService.register("logout@example.com", "User", "pass123");

      await expect(authService.logout(accessToken)).resolves.not.toThrow();
    });
  });

  // ─── forgotPassword ──────────────────────────────────────────────────────────
  describe("forgotPassword()", () => {
    it("không ném lỗi dù email không tồn tại (tránh enumeration)", async () => {
      await expect(authService.forgotPassword("notexist@example.com")).resolves.not.toThrow();
    });

    it("gửi reset email khi user tồn tại", async () => {
      await authService.register("reset@example.com", "User", "pass123");

      const { mailService } = await import("../../../infrastructure/mail");

      await authService.forgotPassword("reset@example.com");

      expect(mailService.sendResetPassword).toHaveBeenCalledWith(
        "reset@example.com",
        expect.any(String)
      );
    });
  });
});

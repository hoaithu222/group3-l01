import { TokenIssuer } from "../services/token-issuer";
import { JwtUtils } from "../../../core/utils/jwt";
import type { User } from "../../users/entities/user.interface";

jest.mock("../../../infrastructure/mail", () => ({
  mailService: {
    sendNewDeviceLogin: jest.fn().mockResolvedValue(undefined),
    sendWelcome: jest.fn().mockResolvedValue(undefined),
    sendResetPassword: jest.fn().mockResolvedValue(undefined),
  },
}));

import { mailService } from "../../../infrastructure/mail";

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "someone@example.com",
    name: "Someone",
    role: "user",
    sessionVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildSessionServiceMock(isKnownDevice: boolean) {
  return {
    isKnownDevice: jest.fn().mockResolvedValue(isKnownDevice),
    create: jest.fn().mockResolvedValue(undefined),
    enforceSessionsMax: jest.fn().mockResolvedValue(undefined),
  };
}

describe("TokenIssuer — cảnh báo đăng nhập thiết bị mới", () => {
  it("notifyNewDevice=true + thiết bị MỚI → gọi mailService.sendNewDeviceLogin", async () => {
    const sessionService = buildSessionServiceMock(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const issuer = new TokenIssuer(sessionService as any);

    await issuer.issue(buildUser(), {
      userAgent: "Mozilla/5.0",
      ipAddress: "1.2.3.4",
      notifyNewDevice: true,
    });

    // isKnownDevice phải được gọi TRƯỚC khi tạo session (không tự khớp với chính nó).
    expect(sessionService.isKnownDevice).toHaveBeenCalled();
    // Mail là fire-and-forget — đợi 1 tick microtask để promise bên trong chạy xong.
    await new Promise(process.nextTick);
    expect(mailService.sendNewDeviceLogin).toHaveBeenCalledWith(
      "someone@example.com",
      expect.objectContaining({ userAgent: "Mozilla/5.0", ipAddress: "1.2.3.4" })
    );
  });

  it("notifyNewDevice=true + thiết bị ĐÃ BIẾT → KHÔNG gọi sendNewDeviceLogin", async () => {
    const sessionService = buildSessionServiceMock(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const issuer = new TokenIssuer(sessionService as any);

    await issuer.issue(buildUser(), { notifyNewDevice: true });
    await new Promise(process.nextTick);

    expect(mailService.sendNewDeviceLogin).not.toHaveBeenCalled();
  });

  it("notifyNewDevice omitted (register) → KHÔNG gọi isKnownDevice/sendNewDeviceLogin", async () => {
    const sessionService = buildSessionServiceMock(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const issuer = new TokenIssuer(sessionService as any);

    await issuer.issue(buildUser());

    expect(sessionService.isKnownDevice).not.toHaveBeenCalled();
    expect(mailService.sendNewDeviceLogin).not.toHaveBeenCalled();
  });

  it("mail bị reject KHÔNG throw và KHÔNG chặn issue() trả kết quả (fire-and-forget)", async () => {
    (mailService.sendNewDeviceLogin as jest.Mock).mockRejectedValueOnce(
      new Error("SMTP tạm thời không khả dụng")
    );
    const sessionService = buildSessionServiceMock(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const issuer = new TokenIssuer(sessionService as any);

    const result = await issuer.issue(buildUser(), { notifyNewDevice: true });

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    // Đợi promise mail (đã reject) được xử lý — không có unhandled rejection nào thoát ra.
    await new Promise(process.nextTick);
  });

  it("tạo Session sau khi kiểm biết-hay-chưa (không tự khớp với phiên vừa tạo)", async () => {
    const sessionService = buildSessionServiceMock(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const issuer = new TokenIssuer(sessionService as any);
    const callOrder: string[] = [];
    sessionService.isKnownDevice.mockImplementation(async () => {
      callOrder.push("isKnownDevice");
      return false;
    });
    sessionService.create.mockImplementation(async () => {
      callOrder.push("create");
    });

    await issuer.issue(buildUser(), { notifyNewDevice: true });

    expect(callOrder).toEqual(["isKnownDevice", "create"]);
  });
});

// ── Bổ sung (rà soát auth BE 2026-09-25): claim `sid` — nhận diện phiên + thu hồi tức thì ───────────────
describe("TokenIssuer — claim sid (id phiên)", () => {
  function sessionServiceMock() {
    return {
      isKnownDevice: jest.fn().mockResolvedValue(true),
      create: jest.fn().mockResolvedValue(undefined),
      enforceSessionsMax: jest.fn().mockResolvedValue(undefined),
      revokeById: jest.fn().mockResolvedValue(true),
    };
  }

  it("issue(): sinh id phiên TRƯỚC, nhúng vào CẢ access lẫn refresh token và ghi Session đúng id đó", async () => {
    const sessionService = sessionServiceMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const issuer = new TokenIssuer(sessionService as any);

    const result = await issuer.issue(buildUser());

    const created = sessionService.create.mock.calls[0]?.[0] as { id: string; refreshToken: string };
    expect(created.id).toMatch(/^[0-9a-f]{24}$/);
    expect(result.sessionId).toBe(created.id);
    expect(created.refreshToken).toBe(result.refreshToken);
    expect(JwtUtils.verifyToken(result.accessToken).sid).toBe(created.id);
    expect(JwtUtils.verifyRefreshToken(result.refreshToken).sid).toBe(created.id);
  });

  it("mỗi lần đăng nhập là một phiên (sid) khác nhau", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const issuer = new TokenIssuer(sessionServiceMock() as any);

    const a = await issuer.issue(buildUser());
    const b = await issuer.issue(buildUser());

    expect(a.sessionId).not.toBe(b.sessionId);
  });

  it("không có SessionService (không lưu phiên) ⇒ không có sid", async () => {
    const result = await new TokenIssuer(undefined).issue(buildUser());

    expect(result.sessionId).toBeUndefined();
    expect(JwtUtils.verifyToken(result.accessToken).sid).toBeUndefined();
  });

  it("issueTokensOnly(user, sid) (refresh) giữ NGUYÊN sid của phiên; sessionVersion lấy từ user hiện tại", () => {
    const issuer = new TokenIssuer(undefined);

    const next = issuer.issueTokensOnly(buildUser({ sessionVersion: 7 }), "66f1b2c3d4e5f60718293a4b");

    expect(JwtUtils.verifyToken(next.accessToken)).toMatchObject({ sid: "66f1b2c3d4e5f60718293a4b", sv: 7 });
    expect(JwtUtils.verifyRefreshToken(next.refreshToken).sid).toBe("66f1b2c3d4e5f60718293a4b");
  });

  it("issueAccessOnly() (sau đổi mật khẩu): chỉ access token, sessionVersion MỚI, giữ sid", () => {
    const issuer = new TokenIssuer(undefined);

    const token = issuer.issueAccessOnly(buildUser({ sessionVersion: 4 }), "66f1b2c3d4e5f60718293a4b");

    expect(JwtUtils.verifyToken(token)).toMatchObject({ sid: "66f1b2c3d4e5f60718293a4b", sv: 4, userId: "user-1" });
  });

  it("discard(): thu hồi phiên vừa tạo; không có SessionService/sessionId thì bỏ qua", async () => {
    const sessionService = sessionServiceMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const issuer = new TokenIssuer(sessionService as any);
    const result = await issuer.issue(buildUser());

    await issuer.discard(result, "user-1");
    await new TokenIssuer(undefined).discard(result, "user-1");
    await issuer.discard({ ...result, sessionId: undefined }, "user-1");

    expect(sessionService.revokeById).toHaveBeenCalledTimes(1);
    expect(sessionService.revokeById).toHaveBeenCalledWith(result.sessionId, "user-1");
  });
});

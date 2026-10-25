import { JwtUtils } from "../jwt";
import { env } from "../../config";

describe("JwtUtils.extractTokenFromHeader", () => {
  it("Bearer hợp lệ ⇒ trả token; scheme không phân biệt hoa/thường (RFC 7235)", () => {
    expect(JwtUtils.extractTokenFromHeader("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(JwtUtils.extractTokenFromHeader("bearer abc")).toBe("abc");
    expect(JwtUtils.extractTokenFromHeader("BEARER abc")).toBe("abc");
  });

  it.each([undefined, "", "Bearer", "Bearer ", "Basic dXNlcjpwYXNz", "Bearer a b", "abc"])(
    "header %p ⇒ UnauthorizedError 401 AUTH_002 (không phải Error chung ⇒ không bị log mức error / trả 500)",
    (header) => {
      expect(() => JwtUtils.extractTokenFromHeader(header)).toThrow(
        expect.objectContaining({ statusCode: 401, errorCode: "AUTH_002" })
      );
    }
  );
});

describe("JwtUtils.accessTokenTtlSeconds", () => {
  const original = env.JWT_EXPIRES_IN;
  afterEach(() => {
    (env as { JWT_EXPIRES_IN: string }).JWT_EXPIRES_IN = original;
  });

  it.each([
    ["15m", 900],
    ["1h", 3600],
    ["30s", 30],
    ["2d", 172_800],
    ["900", 900], // số thuần = giây, như jsonwebtoken
    ["1.5h", 5400],
    ["khong-hop-le", 900], // rơi về 15 phút
    ["0", 900],
  ])("JWT_EXPIRES_IN=%s ⇒ %i giây", (raw, seconds) => {
    (env as { JWT_EXPIRES_IN: string }).JWT_EXPIRES_IN = raw;

    expect(JwtUtils.accessTokenTtlSeconds()).toBe(seconds);
  });
});

describe("JwtUtils — claim sid và phạm vi token", () => {
  it("sid đi vào cả access lẫn refresh token và đọc lại được", () => {
    const sid = "66f1b2c3d4e5f60718293a4b";
    const access = JwtUtils.generateAccessToken({ userId: "u", email: "a@e.com", sv: 3, sid });
    const refresh = JwtUtils.generateRefreshToken({ userId: "u", email: "a@e.com", sid });

    expect(JwtUtils.verifyToken(access)).toMatchObject({ userId: "u", sv: 3, sid });
    expect(JwtUtils.verifyRefreshToken(refresh)).toMatchObject({ userId: "u", sid });
  });

  it("refresh token KHÔNG verify được như access token và ngược lại (secret + audience riêng)", () => {
    const access = JwtUtils.generateAccessToken({ userId: "u", email: "a@e.com" });
    const refresh = JwtUtils.generateRefreshToken({ userId: "u", email: "a@e.com" });

    expect(() => JwtUtils.verifyToken(refresh)).toThrow();
    expect(() => JwtUtils.verifyRefreshToken(access)).toThrow();
  });

  it("mỗi token có jti duy nhất", () => {
    const a = JwtUtils.verifyToken(JwtUtils.generateAccessToken({ userId: "u", email: "a@e.com" }));
    const b = JwtUtils.verifyToken(JwtUtils.generateAccessToken({ userId: "u", email: "a@e.com" }));

    expect(a.jti).toBeDefined();
    expect(a.jti).not.toBe(b.jti);
  });
});

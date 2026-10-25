import { createHash, randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../../core/config";
import { redis } from "../../infrastructure/redis";
import { logger } from "../../infrastructure/logger";
import { UnauthorizedError } from "../exceptions";
import { ErrorCode } from "./error.codes";

export interface JwtPayload {
  userId: string;
  email: string;
  name?: string;
  role?: string;
  /** sessionVersion tại thời điểm phát hành — vô hiệu access token khi khoá/đổi role/anonymize. */
  sv?: number;
  /**
   * Id `Session` (ObjectId) mà token thuộc về — thu hồi TỨC THÌ một phiên riêng lẻ
   * (`core/auth/session-revocation.ts`) và nhận ra "phiên hiện tại" không cần cookie.
   * Vắng ở token phát hành trước khi có `sid` (vẫn hợp lệ, chỉ không thu hồi lẻ tức thì được).
   */
  sid?: string;
  /** JWT ID — duy nhất mỗi token, dùng để trace/blacklist theo id thay vì toàn bộ token. */
  jti?: string;
  iat?: number;
  exp?: number;
}

/**
 * Tập hợp các tiện ích JWT: generate, verify, blacklist.
 * - Access token dùng JWT_SECRET
 * - Refresh token dùng JWT_REFRESH_SECRET riêng biệt
 * - Blacklist lưu vào Redis với TTL = thời gian token còn lại
 */
/**
 * Thuật toán ký DUY NHẤT được chấp nhận.
 *
 * `jwt.verify` không truyền `algorithms` sẽ chấp nhận thuật toán ghi trong
 * header của chính token đó. Đây là gốc rễ của lớp lỗi "algorithm confusion" —
 * pin cứng HS256 để header của kẻ tấn công không quyết định được gì.
 */
const JWT_ALGORITHM: jwt.Algorithm = "HS256";

/** Issuer + audience — ràng buộc token vào đúng ứng dụng và đúng mục đích. */
const JWT_ISSUER = "super-app";
const JWT_AUDIENCE_ACCESS = "super-app:access";
const JWT_AUDIENCE_REFRESH = "super-app:refresh";

/**
 * Key blacklist là HASH của token, không phải token gốc.
 * Lưu token gốc đồng nghĩa bất kỳ ai đọc được Redis (bản backup, log, hay một
 * lệnh `KEYS *`) đều nhặt được JWT còn hiệu lực của người dùng.
 */
function blacklistKey(token: string): string {
  return `blacklist:${createHash("sha256").update(token).digest("hex")}`;
}

/**
 * `JWT_EXPIRES_IN` → giây. Chấp nhận số thuần (giây, như `jsonwebtoken`) hoặc
 * `<số><ms|s|m|h|d|w>`; giá trị lạ rơi về 15 phút.
 */
function parseDurationSeconds(raw: string): number {
  const fallback = 15 * 60;
  const text = raw.trim();
  if (/^\d+$/.test(text)) return Number(text) || fallback;
  const m = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)$/i.exec(text);
  if (!m) return fallback;
  const unit: Record<string, number> = { ms: 0.001, s: 1, m: 60, h: 3600, d: 86_400, w: 604_800 };
  const seconds = Number(m[1]) * (unit[m[2].toLowerCase()] ?? 0);
  return seconds > 0 ? Math.ceil(seconds) : fallback;
}

export class JwtUtils {
  /** Tuổi thọ tối đa của 1 access token (giây) — TTL cho dấu "phiên đã thu hồi" trên Redis. */
  static accessTokenTtlSeconds(): number {
    return parseDurationSeconds(env.JWT_EXPIRES_IN);
  }

  /** Tạo access token (ngắn hạn) */
  static generateAccessToken(payload: Omit<JwtPayload, "iat" | "exp">): string {
    return jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
      algorithm: JWT_ALGORITHM,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE_ACCESS,
      jwtid: randomUUID(),
    } as jwt.SignOptions);
  }

  /** Tạo refresh token (dài hạn), dùng JWT_REFRESH_SECRET riêng */
  static generateRefreshToken(payload: Omit<JwtPayload, "iat" | "exp">): string {
    return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
      algorithm: JWT_ALGORITHM,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE_REFRESH,
      jwtid: randomUUID(),
    } as jwt.SignOptions);
  }

  /**
   * Xác thực access token.
   *
   * Audience riêng biệt khiến refresh token (7 ngày) KHÔNG dùng thay được
   * access token (24 giờ) — nếu không, một cookie bị lộ sẽ có tuổi thọ gấp 7 lần.
   */
  static verifyToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, env.JWT_SECRET, {
        algorithms: [JWT_ALGORITHM],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE_ACCESS,
        clockTolerance: 5,
      }) as JwtPayload;
    } catch {
      throw new Error("Token không hợp lệ hoặc đã hết hạn");
    }
  }

  /** Xác thực refresh token bằng JWT_REFRESH_SECRET */
  static verifyRefreshToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, env.JWT_REFRESH_SECRET, {
        algorithms: [JWT_ALGORITHM],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE_REFRESH,
        clockTolerance: 5,
      }) as JwtPayload;
    } catch {
      throw new Error("Refresh token không hợp lệ hoặc đã hết hạn");
    }
  }

  /**
   * Đưa token vào blacklist Redis với TTL = thời gian còn lại của token.
   * Dùng redis singleton đã connect ở server startup — không cần gọi connect() lại.
   */
  static async blacklistToken(token: string): Promise<void> {
    try {
      const decoded = jwt.decode(token) as JwtPayload | null;
      if (!decoded?.exp) return;
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await redis.set(blacklistKey(token), "1", ttl);
      }
    } catch (err) {
      logger.warn("Không thể blacklist token (Redis không khả dụng):", err);
    }
  }

  /**
   * Kiểm tra token có trong blacklist Redis không.
   * Trả về true nếu đã bị thu hồi.
   */
  static async isTokenBlacklisted(token: string): Promise<boolean> {
    try {
      const value = await redis.get<string>(blacklistKey(token));
      return value !== null;
    } catch {
      // Nếu Redis không khả dụng, cho phép token đi qua (graceful fallback)
      return false;
    }
  }

  /**
   * Trích xuất Bearer token từ Authorization header. Scheme không phân biệt
   * hoa/thường (RFC 7235). Header thiếu/sai định dạng ⇒ `UnauthorizedError`
   * (401 `AUTH_002`) — KHÔNG phải `Error` chung, để middleware không phải log
   * mức `error` cho mỗi request chưa đăng nhập.
   */
  static extractTokenFromHeader(authHeader: string | undefined): string {
    if (!authHeader) {
      throw new UnauthorizedError("Authorization header không tồn tại", ErrorCode.AUTH_002);
    }
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer" || !parts[1]) {
      throw new UnauthorizedError(
        "Authorization header không đúng định dạng (Bearer <token>)",
        ErrorCode.AUTH_002
      );
    }
    return parts[1];
  }
}

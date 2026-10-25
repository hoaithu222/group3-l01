import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma, withTransaction } from "../../../infrastructure/database";
import { NotFoundError, ValidationError } from "../../../core/exceptions/AppError";
import { createContextLogger } from "../../../infrastructure/logger";
import {
  BiometricCredentialRevoker,
  type BiometricRevokeReason,
} from "../../../core/auth/biometric-credential-revoker";
import { markSessionsRevoked } from "../../../core/auth/session-revocation";
import { invalidateUserStatusCache } from "../../../core/permission/user-status";
import { SessionDeviceCleanup } from "./session-device-cleanup";

export interface SessionSummary {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  /** Phiên còn hiệu lực tới khi nào (hạn tuyệt đối của refresh token). */
  expiresAt: Date;
  isCurrent: boolean;
  /** p0-13 — hiện "Đăng nhập bằng Face ID/vân tay" thay vì mật khẩu trên màn Phiên đăng nhập. */
  authMethod: "PASSWORD" | "BIOMETRIC" | "SOCIAL";
  deviceId: string | null;
  /** Phiên chạy trên thiết bị đăng nhập ĐẦU TIÊN của tài khoản (thiết bị gốc). */
  isOriginDevice: boolean;
  /** Thiết bị mới làm quen (chưa phải gốc, xuất hiện lần đầu trong `NEW_DEVICE_BADGE_DAYS` ngày) — app/admin hiện nhãn "Mới". */
  isNewDevice: boolean;
}

export interface CreateSessionInput {
  /** ObjectId tạo sẵn phía server để nhúng vào claim `sid` của token TRƯỚC khi ghi phiên. */
  id?: string;
  userId: string;
  refreshToken: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
  /** p0-13 — phương thức đăng nhập tạo ra phiên này. */
  authMethod?: "PASSWORD" | "BIOMETRIC" | "SOCIAL";
  deviceId?: string;
  biometricCredentialId?: string;
}

/**
 * "Phiên hiện tại" của người gọi — nhận bằng `sessionId` (claim `sid` của access
 * token, dùng được cả cho app không có cookie) hoặc refresh token (cookie web).
 * Truyền `string` = refresh token (tương thích chữ ký cũ).
 */
export type CurrentSessionRef = string | { sessionId?: string; refreshToken?: string };

/** Ngưỡng "thiết bị/vị trí đã biết" cho cảnh báo đăng nhập thiết bị mới. */
const KNOWN_DEVICE_WINDOW_DAYS = 90;
/** Số ngày thiết bị còn được gắn nhãn "Mới" ở danh sách phiên. */
const NEW_DEVICE_BADGE_DAYS = 7;

export type RotateResult = { ok: true; sessionId?: string } | { ok: false; reuse: boolean };

const log = createContextLogger({ service: "SessionService" });

/** Cửa sổ tha thứ sau khi rotate — request thứ 2 của cùng client retry mạng
 * vẫn dùng token cũ trong khoảng này thay vì bị coi là reuse. */
const ROTATE_GRACE_MS = 30_000;
/** Số lần thử lại khi thua đua ghi đồng thời lên cùng một phiên. */
const ROTATE_MAX_ATTEMPTS = 3;
/** Cắt `User-Agent` (header do client tự khai, tối đa vài KB) trước khi lưu/hiển thị. */
const USER_AGENT_MAX_LENGTH = 512;

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * ⚠️ Prisma + MongoDB: `{ revokedAt: null }` CHỈ khớp tài liệu có `revokedAt`
 * ghi tường minh là `null`, KHÔNG khớp tài liệu mà trường vắng mặt (đã kiểm
 * trên Mongo thật). Phiên tạo trước bản sửa (`create()` không ghi `revokedAt`)
 * còn nằm trong DB tới khi hết hạn ⇒ mọi truy vấn "còn hiệu lực" PHẢI dùng cả
 * hai vế.
 */
function notRevoked(): Prisma.SessionWhereInput {
  return { OR: [{ revokedAt: null }, { revokedAt: { isSet: false } }] };
}

function normalizeCurrent(current: CurrentSessionRef | undefined): {
  sessionId?: string;
  tokenHash?: string;
} {
  if (!current) return {};
  if (typeof current === "string") return current ? { tokenHash: hash(current) } : {};
  return {
    ...(current.sessionId && { sessionId: current.sessionId }),
    ...(current.refreshToken && { tokenHash: hash(current.refreshToken) }),
  };
}

export class SessionService {
  /**
   * `deviceCleanup`: gỡ push token (`DeviceToken`) của thiết bị có phiên vừa bị thu hồi TỪ XA — mặc định dùng `DeviceService` thật; truyền
   * `new SessionDeviceCleanup(null)` để tắt (test không cần thiết bị). Best-effort, không bao giờ làm hỏng việc thu hồi phiên.
   */
  constructor(private readonly deviceCleanup: SessionDeviceCleanup = new SessionDeviceCleanup()) {}

  /** Tạo session mới khi issue refresh token (login/register/biometric-login). */
  async create(input: CreateSessionInput): Promise<void> {
    await prisma.session.create({
      data: {
        ...(input.id && { id: input.id }),
        userId: input.userId,
        refreshTokenHash: hash(input.refreshToken),
        // Ghi null TƯỜNG MINH cho mọi trường về sau bị lọc `{ field: null }`
        // (xem `notRevoked()`); các trường còn lại cũng tường minh cho nhất quán.
        previousTokenHash: null,
        rotatedAt: null,
        revokedAt: null,
        userAgent: input.userAgent ? input.userAgent.slice(0, USER_AGENT_MAX_LENGTH) : null,
        ipAddress: input.ipAddress ?? null,
        expiresAt: input.expiresAt,
        authMethod: input.authMethod ?? "PASSWORD",
        deviceId: input.deviceId ?? null,
        biometricCredentialId: input.biometricCredentialId ?? null,
      },
    });
  }

  /**
   * Kiểm thiết bị/vị trí đã biết chưa (trong `KNOWN_DEVICE_WINDOW_DAYS` ngày
   * gần nhất) — dùng cho cảnh báo "đăng nhập thiết bị mới" qua email. Ưu
   * tiên khớp `deviceId`; không có thì khớp cặp `userAgent` + `ipAddress`.
   *
   * CỐ TÌNH không lọc `revokedAt: null` — đăng xuất rồi đăng nhập lại từ
   * CHÍNH thiết bị cũ vẫn phải tính là "đã biết", không được coi là mới.
   * Gọi TRƯỚC khi tạo session mới của lượt đăng nhập hiện tại (nếu không sẽ
   * luôn tự khớp với chính phiên vừa tạo).
   */
  async isKnownDevice(
    userId: string,
    meta: { deviceId?: string; userAgent?: string; ipAddress?: string }
  ): Promise<boolean> {
    const since = new Date(Date.now() - KNOWN_DEVICE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    if (meta.deviceId) {
      const byDevice = await prisma.session.findFirst({
        where: { userId, deviceId: meta.deviceId, createdAt: { gte: since } },
        select: { id: true },
      });
      if (byDevice) return true;
    }

    if (meta.userAgent && meta.ipAddress) {
      const byFingerprint = await prisma.session.findFirst({
        where: {
          userId,
          userAgent: meta.userAgent.slice(0, USER_AGENT_MAX_LENGTH),
          ipAddress: meta.ipAddress,
          createdAt: { gte: since },
        },
        select: { id: true },
      });
      if (byFingerprint) return true;
    }

    return false;
  }

  /**
   * Giữ tối đa `max` session còn hiệu lực cho 1 user — vượt ngưỡng thì thu
   * hồi các phiên `lastUsedAt` cũ nhất (LIMITS.auth.sessionsMax, p0-01/p0-13).
   */
  async enforceSessionsMax(userId: string, max: number): Promise<void> {
    const now = new Date();
    const active = await prisma.session.findMany({
      where: { AND: [notRevoked(), { userId, expiresAt: { gt: now } }] },
      orderBy: { lastUsedAt: "desc" },
      select: { id: true },
    });
    if (active.length <= max) return;
    const toRevoke = active.slice(max).map((s) => s.id);
    await prisma.session.updateMany({
      where: { id: { in: toRevoke } },
      data: { revokedAt: now },
    });
    await markSessionsRevoked(toRevoke);
  }

  /**
   * Xoay refresh token (compare-and-set nguyên tử trên tài liệu phiên).
   * - token khớp `refreshTokenHash` → rotate (ghi previous, hash mới).
   * - token khớp `previousTokenHash` trong 30s → tha thứ retry mạng: xoay TIẾP
   *   để client nhận token mới ĐÃ LƯU (trước đây trả `ok` mà không lưu ⇒ token
   *   trả về vô dụng, lần refresh kế tiếp báo hết phiên).
   * - token khớp `previousTokenHash` quá 30s → reuse: thu hồi mọi session của user → { ok:false, reuse:true }.
   * - không khớp gì → { ok:false, reuse:false } (token không hợp lệ/hết hạn/đã thu hồi).
   */
  async rotate(oldToken: string, newToken: string): Promise<RotateResult> {
    const h = hash(oldToken);
    const newHash = hash(newToken);

    for (let attempt = 0; attempt < ROTATE_MAX_ATTEMPTS; attempt++) {
      const now = new Date();
      const session = await prisma.session.findFirst({
        where: {
          AND: [
            notRevoked(),
            { expiresAt: { gt: now } },
            { OR: [{ refreshTokenHash: h }, { previousTokenHash: h }] },
          ],
        },
      });
      if (!session) return { ok: false, reuse: false };

      if (session.refreshTokenHash === h) {
        const r = await prisma.session.updateMany({
          where: { AND: [notRevoked(), { id: session.id, refreshTokenHash: h }] },
          data: { previousTokenHash: h, refreshTokenHash: newHash, rotatedAt: now, lastUsedAt: now },
        });
        if (r.count === 1) return { ok: true, sessionId: session.id };
        continue; // request khác vừa xoay token này — đọc lại và xử như token "cũ"
      }

      // Token khớp previousTokenHash
      if (session.rotatedAt && now.getTime() - session.rotatedAt.getTime() <= ROTATE_GRACE_MS) {
        const r = await prisma.session.updateMany({
          where: {
            AND: [
              notRevoked(),
              {
                id: session.id,
                previousTokenHash: h,
                refreshTokenHash: session.refreshTokenHash,
              },
            ],
          },
          data: {
            previousTokenHash: session.refreshTokenHash,
            refreshTokenHash: newHash,
            rotatedAt: now,
            lastUsedAt: now,
          },
        });
        if (r.count === 1) return { ok: true, sessionId: session.id };
        continue;
      }

      // Reuse thật: token đã rotate từ lâu vẫn bị dùng lại → nghi ngờ rò rỉ.
      await this.revokeEverything(session.userId, "REUSE_DETECTED");
      log.warn("Refresh token reuse detected — all sessions revoked", { userId: session.userId });
      return { ok: false, reuse: true };
    }
    return { ok: false, reuse: false };
  }

  /**
   * Thu hồi session theo refresh token (dùng khi logout) — khớp cả token hiện
   * tại lẫn token vừa bị xoay (client logout ngay sau khi refresh). `userId`
   * (nếu có) ràng phiên phải thuộc đúng người gọi. Trả id phiên đã thu hồi,
   * `null` nếu không có phiên nào khớp.
   */
  async revokeByToken(token: string, userId?: string): Promise<string | null> {
    const h = hash(token);
    const sessions = await prisma.session.findMany({
      where: {
        AND: [
          notRevoked(),
          { OR: [{ refreshTokenHash: h }, { previousTokenHash: h }] },
          ...(userId ? [{ userId }] : []),
        ],
      },
      select: { id: true },
    });
    if (sessions.length === 0) return null;
    const ids = sessions.map((s) => s.id);
    await prisma.session.updateMany({ where: { id: { in: ids } }, data: { revokedAt: new Date() } });
    await markSessionsRevoked(ids);
    return ids[0] ?? null;
  }

  /** Thu hồi 1 phiên theo id (đăng xuất khi chỉ biết `sid` của access token). Trả `true` nếu có phiên bị thu hồi. */
  async revokeById(sessionId: string, userId: string): Promise<boolean> {
    const r = await prisma.session.updateMany({
      where: { AND: [notRevoked(), { id: sessionId, userId }] },
      data: { revokedAt: new Date() },
    });
    if (r.count === 0) return false;
    await markSessionsRevoked([sessionId]);
    return true;
  }

  /**
   * Thu hồi mọi session KHÁC phiên hiện tại — dùng sau đổi mật khẩu. Không
   * xác định được phiên hiện tại (không `sessionId`, không refresh token) ⇒
   * thu hồi TẤT CẢ (an toàn hơn giữ nhầm phiên lạ). Trả số phiên đã thu hồi.
   */
  async revokeOthers(userId: string, current?: CurrentSessionRef): Promise<number> {
    const { sessionId, tokenHash } = normalizeCurrent(current);
    const exclude: Prisma.SessionWhereInput[] = [];
    if (sessionId) exclude.push({ NOT: { id: sessionId } });
    else if (tokenHash) exclude.push({ NOT: { refreshTokenHash: tokenHash } });

    const targets = await prisma.session.findMany({
      where: { AND: [notRevoked(), { userId }, ...exclude] },
      select: { id: true, deviceId: true },
    });
    if (targets.length === 0) return 0;
    const ids = targets.map((s) => s.id);
    await prisma.session.updateMany({ where: { id: { in: ids } }, data: { revokedAt: new Date() } });
    await markSessionsRevoked(ids);
    await this.cleanupRevokedDevices(userId, targets.map((t) => t.deviceId));
    return ids.length;
  }

  /**
   * Thu hồi TOÀN BỘ session của user + tăng sessionVersion (vô hiệu access
   * token cũ) + thu hồi mọi credential sinh trắc học (p0-13 §5.5) + xoá cache
   * trạng thái (`sessionVersion` mới có hiệu lực ngay, không chờ TTL 60 s).
   * `reason` cho phép nơi gọi ghi đúng nguyên nhân (khoá tài khoản, yêu cầu
   * xoá, đăng xuất mọi thiết bị, ...) vào `BiometricCredential.revokeReason`. Gỡ luôn push token (`DeviceToken`) của mọi thiết bị.
   * Trả số phiên đã thu hồi.
   */
  async revokeAll(userId: string, reason: BiometricRevokeReason = "SESSIONS_REVOKED"): Promise<number> {
    return this.revokeEverything(userId, reason);
  }

  /**
   * Đổi mật khẩu + thu hồi phiên trong MỘT transaction (User + Session):
   * `passwordHash`, `passwordChangedAt`, `sessionVersion + 1` (vô hiệu MỌI
   * access token cũ ngay) và `revokedAt` cho các phiên bị thu hồi — hoặc cả
   * hai đều xảy ra, hoặc không gì cả (trước đây ghi rời nên lỗi giữa chừng để
   * lại mật khẩu mới NHƯNG phiên cũ còn sống).
   *
   * `keep` = phiên hiện tại được GIỮ (đổi mật khẩu khi đang đăng nhập); bỏ
   * trống ⇒ thu hồi TẤT CẢ (đặt lại mật khẩu qua email, hoặc không xác định
   * được phiên hiện tại). Sau commit: thu hồi credential sinh trắc học
   * (`reason`) và xoá cache trạng thái để `sessionVersion` mới có hiệu lực ngay.
   *
   * Ngoại lệ hẹp so với "service không đụng Prisma": nghiệp vụ nguyên tử xuyên
   * 2 collection, cùng lý do `UserAnonymizer`/`revokeAll` ở đây.
   */
  async applyPasswordChange(
    userId: string,
    passwordHash: string,
    opts: { keep?: CurrentSessionRef; reason: BiometricRevokeReason }
  ): Promise<{ revokedSessions: number; sessionVersion: number }> {
    const { sessionId, tokenHash } = normalizeCurrent(opts.keep);
    const exclude: Prisma.SessionWhereInput[] = [];
    if (sessionId) exclude.push({ NOT: { id: sessionId } });
    else if (tokenHash) exclude.push({ NOT: { refreshTokenHash: tokenHash } });

    const now = new Date();
    const result = await withTransaction(async (tx) => {
      const targets = await tx.session.findMany({
        where: { AND: [notRevoked(), { userId }, ...exclude] },
        select: { id: true, deviceId: true },
      });
      const ids = targets.map((s) => s.id);
      if (ids.length > 0) {
        await tx.session.updateMany({ where: { id: { in: ids } }, data: { revokedAt: now } });
      }
      const user = await tx.user.update({
        where: { id: userId },
        data: { passwordHash, passwordChangedAt: now, sessionVersion: { increment: 1 } },
        select: { sessionVersion: true },
      });
      return {
        revokedSessions: ids.length,
        sessionVersion: user.sessionVersion,
        revokedDeviceIds: targets.map((t) => t.deviceId),
      };
    });

    // Sau commit: sinh trắc học + push token của các thiết bị vừa bị đăng xuất (thiết bị của phiên được giữ thì giữ nguyên push).
    // Không giữ phiên nào (đặt lại mật khẩu, hoặc không xác định được phiên hiện tại) ⇒ gỡ push của MỌI thiết bị.
    if (sessionId || tokenHash) await this.cleanupRevokedDevices(userId, result.revokedDeviceIds);
    else await this.deviceCleanup.unregisterAll(userId);
    await BiometricCredentialRevoker.revokeAllForUser(userId, opts.reason);
    try {
      await invalidateUserStatusCache(userId);
    } catch (err) {
      log.warn("Không xoá được cache trạng thái tài khoản sau khi đổi mật khẩu", {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return { revokedSessions: result.revokedSessions, sessionVersion: result.sessionVersion };
  }

  /**
   * List all active (non-revoked, non-expired) sessions for a user.
   * `current` optional — quản trị viên xem phiên của người khác không có khái
   * niệm "phiên hiện tại", tự người dùng xem của mình mới có.
   */
  async listActive(userId: string, current?: CurrentSessionRef): Promise<SessionSummary[]> {
    const now = new Date();
    const sessions = await prisma.session.findMany({
      where: { AND: [notRevoked(), { userId, expiresAt: { gt: now } }] },
      orderBy: { lastUsedAt: "desc" },
    });

    const devices = await prisma.knownDevice.findMany({
      where: { userId },
      select: { deviceId: true, isOrigin: true, firstSeenAt: true },
    });
    const deviceById = new Map(devices.map((d) => [d.deviceId, d]));
    const newSince = now.getTime() - NEW_DEVICE_BADGE_DAYS * 24 * 60 * 60 * 1000;

    const { sessionId, tokenHash } = normalizeCurrent(current);
    return sessions.map((s) => {
      const device = s.deviceId ? deviceById.get(s.deviceId) : undefined;
      return {
        id: s.id,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt,
        expiresAt: s.expiresAt,
        isCurrent:
          (sessionId !== undefined && s.id === sessionId) ||
          (tokenHash !== undefined && s.refreshTokenHash === tokenHash),
        authMethod: s.authMethod,
        deviceId: s.deviceId,
        isOriginDevice: device?.isOrigin ?? false,
        isNewDevice: !!device && !device.isOrigin && device.firstSeenAt.getTime() >= newSince,
      };
    });
  }

  /**
   * Revoke a session by id — cannot revoke the current session (use /logout
   * instead). `current` optional — bỏ qua kiểm tra này khi quản trị viên thu
   * hồi phiên của người khác. Phiên không thuộc `userId` ⇒ 404; đã thu hồi từ
   * trước thì gọi lại vẫn thành công (idempotent, không ghi đè `revokedAt`).
   */
  async revoke(sessionId: string, userId: string, current?: CurrentSessionRef): Promise<void> {
    const session = await prisma.session.findFirst({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundError("Phiên đăng nhập không tồn tại");

    const { sessionId: currentId, tokenHash } = normalizeCurrent(current);
    if (session.id === currentId || (tokenHash && session.refreshTokenHash === tokenHash)) {
      throw new ValidationError("Không thể thu hồi phiên hiện tại — hãy dùng /logout để đăng xuất");
    }

    const r = await prisma.session.updateMany({
      where: { AND: [notRevoked(), { id: sessionId, userId }] },
      data: { revokedAt: new Date() },
    });
    if (r.count > 0) {
      await markSessionsRevoked([sessionId]);
      log.info("Session revoked", { sessionId, userId });
      // Thiết bị của phiên bị thu hồi từ xa không được tiếp tục nhận push (trừ khi còn phiên khác cùng `deviceId`).
      await this.cleanupRevokedDevices(userId, [session.deviceId]);
    }
  }

  /** Thiết bị (`deviceId`) của các phiên còn hiệu lực — máy còn đăng nhập thì không bị gỡ push. */
  private async activeDeviceIds(userId: string): Promise<Set<string>> {
    const rows = await prisma.session.findMany({
      where: { AND: [notRevoked(), { userId, expiresAt: { gt: new Date() } }] },
      select: { deviceId: true },
    });
    return new Set(rows.map((r) => r.deviceId).filter((id): id is string => !!id));
  }

  /** Gỡ push của thiết bị thuộc các phiên vừa thu hồi (best-effort — lỗi chỉ ghi log). */
  private async cleanupRevokedDevices(
    userId: string,
    revokedDeviceIds: ReadonlyArray<string | null>
  ): Promise<void> {
    if (!revokedDeviceIds.some(Boolean)) return;
    try {
      await this.deviceCleanup.unregisterRevoked(userId, revokedDeviceIds, await this.activeDeviceIds(userId));
    } catch (err) {
      log.warn("Không gỡ được push token của thiết bị sau khi thu hồi phiên", {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Thu hồi mọi phiên + tăng `sessionVersion` + thu hồi sinh trắc học + xoá cache trạng thái. */
  private async revokeEverything(userId: string, reason: BiometricRevokeReason): Promise<number> {
    const r = await prisma.session.updateMany({
      where: { AND: [notRevoked(), { userId }] },
      data: { revokedAt: new Date() },
    });
    await prisma.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
    });
    await BiometricCredentialRevoker.revokeAllForUser(userId, reason);
    // Không còn phiên nào ⇒ không thiết bị nào còn lý do nhận push cho tài khoản này (khoá, yêu cầu xoá, đăng xuất mọi nơi, reuse…).
    await this.deviceCleanup.unregisterAll(userId);
    try {
      await invalidateUserStatusCache(userId);
    } catch (err) {
      log.warn("Không xoá được cache trạng thái tài khoản sau khi thu hồi phiên", {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return r.count;
  }
}

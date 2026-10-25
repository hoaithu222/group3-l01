import { Prisma } from "@prisma/client";
import { prisma, withTransaction } from "../../../infrastructure/database";
import { createContextLogger } from "../../../infrastructure/logger";
import { notify } from "../../notifications/public";
import { AUTH_NOTIFICATION_TYPES } from "./auth-notification-types";
import type { SessionService } from "./session.service";

const log = createContextLogger({ service: "DeviceTrustService" });

/** Thiết bị (không phải máy gốc) im quá ngần này ngày thì lần đăng nhập kế tiếp coi lại là "mới". */
const KNOWN_DEVICE_TTL_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const USER_AGENT_MAX_LENGTH = 512;

export interface DeviceMeta {
  deviceId?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface DeviceTrustResult {
  /** Thiết bị/vị trí đã biết — `false` ⇒ cảnh báo đăng nhập thiết bị mới. */
  known: boolean;
  /** Thiết bị đăng nhập ĐẦU TIÊN của tài khoản. */
  isOrigin: boolean;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * Nhận diện thiết bị quen / lạ / gốc của tài khoản (bảng `KnownDevice`).
 *
 * · Gốc (`isOrigin`): thiết bị đăng nhập đầu tiên của tài khoản — không bao giờ hết hạn, đúng 1 máy/tài khoản.
 *   Tài khoản có từ trước khi có bảng này: máy gốc suy ra từ phiên cũ nhất có `deviceId`.
 * · Quen: đã có bản ghi và `lastSeenAt` trong `KNOWN_DEVICE_TTL_DAYS` ngày (hoặc là máy gốc). Chưa có bản ghi nhưng
 *   lịch sử phiên khớp (`SessionService.isKnownDevice`) cũng tính là quen — không cảnh báo oan người dùng cũ.
 * · Không có `deviceId` (client không gửi `X-Device-Id`): chỉ còn khớp `userAgent`+IP như trước, không ghi bản ghi.
 *
 * Gọi TRƯỚC khi tạo phiên của lượt đăng nhập hiện tại (nếu không lịch sử phiên tự khớp với chính nó).
 */
export class DeviceTrustService {
  constructor(private readonly sessions: Pick<SessionService, "isKnownDevice">) {}

  async evaluate(userId: string, meta: DeviceMeta): Promise<DeviceTrustResult> {
    const { deviceId } = meta;
    if (!deviceId) {
      return { known: await this.sessions.isKnownDevice(userId, meta), isOrigin: false };
    }

    const now = new Date();
    const deviceKey = `${userId}:${deviceId}`;
    const userAgent = meta.userAgent ? meta.userAgent.slice(0, USER_AGENT_MAX_LENGTH) : null;
    const ipAddress = meta.ipAddress ?? null;

    const existing = await prisma.knownDevice.findUnique({ where: { deviceKey } });
    if (existing) {
      const fresh = existing.isOrigin || existing.lastSeenAt.getTime() >= now.getTime() - KNOWN_DEVICE_TTL_DAYS * DAY_MS;
      await prisma.knownDevice.update({
        where: { id: existing.id },
        data: { lastSeenAt: now, userAgent, ipAddress },
      });
      return { known: fresh, isOrigin: existing.isOrigin };
    }

    let known = await this.sessions.isKnownDevice(userId, meta);
    let isOrigin = false;

    const hasRecords = (await prisma.knownDevice.findFirst({ where: { userId }, select: { id: true } })) !== null;
    if (!hasRecords) {
      const oldest = await prisma.session.findFirst({
        where: { userId, deviceId: { not: null } },
        orderBy: { createdAt: "asc" },
        select: { deviceId: true, userAgent: true, ipAddress: true, createdAt: true },
      });
      if (oldest?.deviceId && oldest.deviceId !== deviceId) {
        // Tài khoản cũ: máy gốc là máy đã đăng nhập đầu tiên, KHÔNG phải máy đang đăng nhập.
        await this.insert(userId, oldest.deviceId, true, oldest, oldest.createdAt);
      } else {
        isOrigin = true;
        const anySession = oldest ?? (await prisma.session.findFirst({ where: { userId }, select: { id: true } }));
        // Máy đầu tiên của tài khoản chưa từng có phiên nào, hoặc chính máy gốc quay lại ⇒ không phải máy lạ.
        if (oldest || !anySession) known = true;
      }
    }

    const created = await this.insert(userId, deviceId, isOrigin, { userAgent, ipAddress }, now);
    // Thua đua giành vai trò gốc với một lượt đăng nhập song song ⇒ chỉ được là máy thường.
    if (isOrigin && !created.isOrigin) isOrigin = false;

    return { known, isOrigin };
  }

  /**
   * Báo thiết bị lạ ĐẾN mọi máy còn nhận push của tài khoản + hộp thư trong app (cùng email đã có). Idempotent theo ngày/thiết bị.
   * Best-effort: lỗi chỉ ghi log, không bao giờ chặn đăng nhập. Không có `deviceId` ⇒ bỏ qua (email vẫn gửi).
   */
  async notifyUnknown(userId: string, meta: DeviceMeta): Promise<void> {
    if (!meta.deviceId) return;
    try {
      const day = new Date().toISOString().slice(0, 10);
      await withTransaction((tx) =>
        notify(tx, {
          type: AUTH_NOTIFICATION_TYPES.NEW_DEVICE,
          scope: null,
          source: { type: "KnownDevice", id: `${userId}:${meta.deviceId}` },
          // CHỈ nhãn nền tảng — không đưa IP/UA vào bản ghi thông báo và push (màn hình khoá có thể bị người khác nhìn thấy).
          refs: { deviceId: meta.deviceId },
          recipients: [{ userId }],
          dedupeKey: `auth.new-device:${userId}:${meta.deviceId}:${day}`,
        })
      );
    } catch (err) {
      log.warn("Không tạo được thông báo đăng nhập thiết bị mới", { userId, err });
    }
  }

  private async insert(
    userId: string,
    deviceId: string,
    isOrigin: boolean,
    src: { userAgent: string | null; ipAddress: string | null },
    at: Date
  ): Promise<{ isOrigin: boolean }> {
    const deviceKey = `${userId}:${deviceId}`;
    const data = (origin: boolean): Prisma.KnownDeviceUncheckedCreateInput => ({
      userId,
      deviceId,
      deviceKey,
      originKey: origin ? userId : `n:${deviceKey}`,
      isOrigin: origin,
      userAgent: src.userAgent,
      ipAddress: src.ipAddress,
      firstSeenAt: at,
      lastSeenAt: at,
    });
    try {
      await prisma.knownDevice.create({ data: data(isOrigin) });
      return { isOrigin };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      if (!isOrigin) return { isOrigin: false }; // cùng máy đăng nhập song song — bản ghi đã có
      try {
        await prisma.knownDevice.create({ data: data(false) });
      } catch (retryErr) {
        if (!isUniqueViolation(retryErr)) throw retryErr;
      }
      return { isOrigin: false };
    }
  }
}

import bcrypt from "bcryptjs";
import type { IUserRepository, UserListParams } from "../repositories/user.repository.interface";
import type {
  User,
  UserCreateInput,
  UserUpdateInput,
  UserPrivacy,
} from "../entities/user.interface";
import {
  AppError,
  NotFoundError,
  ConflictError,
  ValidationError,
  UnauthorizedError,
  DeletionNotPendingError,
  SelfAnonymizeForbiddenError,
  AnonymizeNowForbiddenError,
  ConfirmEmailMismatchError,
} from "../../../core/exceptions";
import { ROLES, type RoleCode } from "../../../core/constants";
import { LIMITS } from "../../../core/constants/limits";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { invalidateUserStatusCache } from "../../../core/permission/user-status";
import type { PasswordAttemptGuard } from "../../../core/auth/password-attempt-guard";
import { normalizeEmail } from "../../../core/auth/normalize-email";
import { assertCanDeleteAccount } from "../../../core/permission/ownership-guard";
import { disconnectUserSockets } from "../../../infrastructure/socket";
import { prisma, withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { mailService } from "../../../infrastructure/mail";
import { logger } from "../../../infrastructure/logger";
import {
  BiometricCredentialRevoker,
  type AdminBiometricCredentialDto,
} from "../../../core/auth/biometric-credential-revoker";
import { UserAnonymizer } from "./user-anonymizer";
import { avatarUrlOf } from "../../../shared/media";

/** Hash bcrypt của một chuỗi cố định (KHÔNG phải bí mật) — so sánh giả khi email không tồn tại để thời gian phản hồi đồng đều. */
const TIMING_DUMMY_HASH = "$2a$10$WvnvZiKW2BCa.41/aORspuQW7/Si1jp0MI6yyg5er79gY.xwJ/4ci";

/** Kết quả `requestDeletion`/`cancelDeletion`/`anonymizeAdmin` (GRACE) — be.md §4. */
export interface DeletionStatusResult {
  status: string;
  deletionGraceUntil?: Date | null;
}

/** Kết quả `anonymizeAdmin` (mode NOW) — be.md §4. */
export interface AnonymizeResult {
  status: string;
  deletionGraceUntil?: Date;
  anonymizedAt?: Date;
}

export interface UserSessionSummary {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  /** Hạn tuyệt đối của phiên (refresh token). */
  expiresAt?: Date;
  isCurrent: boolean;
  /** p0-13 — cách đăng nhập tạo ra phiên. */
  authMethod?: "PASSWORD" | "BIOMETRIC" | "SOCIAL";
  /**
   * Mã thiết bị ĐẦY ĐỦ — CHỈ trả cho chính chủ (xem phiên của mình); `null` khi phiên cũ chưa ghi.
   * Quản trị viên xem phiên của người khác nhận `deviceIdMasked` thay thế.
   */
  deviceId?: string | null;
  /** "••••" + 6 ký tự cuối của `deviceId` — dạng rút gọn cho quản trị viên (cùng quy ước `AdminBiometricCredentialDto.deviceIdMasked`). */
  deviceIdMasked?: string | null;
  /** Phiên chạy trên thiết bị đăng nhập đầu tiên của tài khoản. */
  isOriginDevice?: boolean;
  /** Thiết bị mới làm quen (≤ 7 ngày, chưa phải gốc). */
  isNewDevice?: boolean;
}

/** Rút gọn mã thiết bị: chỉ lộ 6 ký tự cuối. */
function maskDeviceId(deviceId: string): string {
  return deviceId.length <= 6 ? `••••${deviceId}` : `••••${deviceId.slice(-6)}`;
}

/**
 * "Phiên hiện tại" của người gọi: `string` = refresh token (cookie web);
 * object = `sessionId` (claim `sid` của access token — dùng được cho app không có cookie).
 */
export type CurrentSessionRef = string | { sessionId?: string; refreshToken?: string };

/** Cổng quản lý session — thoả mãn bởi `SessionService` (module auth) qua structural typing. */
export interface SessionManager {
  /** Trả số phiên đã thu hồi (hoặc `void` với bản cài đặt giả lập trong test). */
  revokeAll(userId: string, reason?: string): Promise<number | void>;
  listActive(userId: string, current?: CurrentSessionRef): Promise<UserSessionSummary[]>;
  revoke(sessionId: string, userId: string, current?: CurrentSessionRef): Promise<void>;
}

/** Cổng ghi audit log — thoả mãn bởi `AuditService` (module audit-log) qua structural typing. */
export interface AuditRecorder {
  record(input: {
    actorId: string;
    actorRole?: string;
    action: string;
    targetType: string;
    targetId: string;
    reason?: string;
    metadata?: Record<string, unknown>;
    ip?: string;
    userAgent?: string;
  }): Promise<void>;
}

export class UserService {
  constructor(
    private readonly repo: IUserRepository,
    private readonly sessions?: SessionManager,
    private readonly audit?: AuditRecorder,
    private readonly anonymizer: UserAnonymizer = new UserAnonymizer(),
    /** Đếm lần nhập sai mật khẩu ở các thao tác xác nhận lại (xoá tài khoản) — chống dò mật khẩu. */
    private readonly reauthGuard?: PasswordAttemptGuard
  ) {}

  async getById(id: string): Promise<User> {
    const user = await this.repo.findById(id);
    if (!user) throw new NotFoundError("Không tìm thấy người dùng");
    return this.sanitize(user);
  }

  async getMany(page = 1, limit = 10): Promise<{ data: User[]; total: number }> {
    const offset = (page - 1) * limit;
    const { data, total } = await this.repo.findMany(limit, offset);
    return { data: data.map((u) => this.sanitize(u)), total };
  }

  /** Danh sách có lọc — dùng cho admin (`GET /users?q=&role=&status=`). */
  async list(params: UserListParams): Promise<{ data: User[]; total: number }> {
    const { data, total } = await this.repo.findManyFiltered(params);
    return { data: data.map((u) => this.sanitize(u)), total };
  }

  async create(input: UserCreateInput): Promise<User> {
    const existing = await this.repo.findByEmail(input.email);
    if (existing) throw new ConflictError("Email đã tồn tại");
    const passwordHash = input.password
      ? await bcrypt.hash(input.password, 10)
      : input.passwordHash;
    const user = await this.repo.create({ ...input, passwordHash });
    return this.sanitize(user);
  }

  /**
   * Cập nhật hồ sơ. Đổi VAI TRÒ, MẬT KHẨU hoặc EMAIL là thay đổi danh tính/quyền
   * nên phải có hiệu lực NGAY và có dấu vết: thu hồi mọi phiên (`sessionVersion`
   * tăng — token cũ còn mang vai trò/mật khẩu cũ), xoá cache trạng thái, ngắt
   * socket, ghi audit `user.update`; đổi email đặt lại `emailVerified`.
   * `actor` (người thao tác, nếu biết) không được tự đổi vai trò của chính mình
   * qua đường này — như `changeRole`. Tự đổi MẬT KHẨU/EMAIL của chính mình (kể cả khi có
   * `user:update`) phải kèm `currentPassword` (xác nhận lại danh tính như `/auth/change-password`):
   * token bị lộ không đủ để chiếm tài khoản.
   */
  async update(
    id: string,
    input: UserUpdateInput,
    actor?: { id: string; role?: string }
  ): Promise<User> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError("Không tìm thấy người dùng");

    const updateData: UserUpdateInput = { ...input };
    delete updateData.password;
    delete updateData.currentPassword; // chỉ để xác nhận — KHÔNG ghi xuống repository
    const roleChanged = input.role !== undefined && input.role !== existing.role;
    const emailChanged =
      input.email !== undefined && normalizeEmail(input.email) !== existing.email;
    const passwordChanged = !!input.password;
    if (roleChanged && actor?.id === id) {
      throw new ValidationError("Không thể đổi vai trò của chính mình");
    }
    if (actor?.id === id && (passwordChanged || emailChanged)) {
      await this.assertCurrentPassword(existing, input.currentPassword);
    }
    if (passwordChanged) {
      updateData.passwordHash = await bcrypt.hash(input.password as string, 10);
    }
    if (emailChanged) {
      // Kiểm trùng tường minh (không chỉ dựa vào unique index — repository vẫn map P2002 cho trường hợp chạy đua).
      const taken = await this.repo.findByEmail(input.email as string);
      if (taken && taken.id !== id) throw new ConflictError("Email đã tồn tại");
      updateData.emailVerified = false;
    }

    const user = await this.repo.update(id, updateData);
    if (!user) throw new NotFoundError("Không tìm thấy người dùng");

    if (roleChanged || passwordChanged || emailChanged) {
      await this.sessions?.revokeAll(id, passwordChanged ? "PASSWORD_CHANGED" : "SESSIONS_REVOKED");
      await invalidateUserStatusCache(id);
      disconnectUserSockets(id, "credentials-changed");
      await this.audit?.record({
        actorId: actor?.id ?? id,
        actorRole: actor?.role,
        action: "user.update",
        targetType: "User",
        targetId: id,
        metadata: {
          fields: [
            ...(roleChanged ? ["role"] : []),
            ...(passwordChanged ? ["password"] : []),
            ...(emailChanged ? ["email"] : []),
          ],
          ...(roleChanged && { role: input.role }),
        },
      });
    }
    return this.sanitize(user);
  }

  /**
   * Xác nhận lại mật khẩu HIỆN TẠI khi người dùng tự đổi mật khẩu/email của chính mình: thiếu → 400 `AUTH_021`; sai → 401 `AUTH_001` (đếm theo tài khoản bằng
   * `reauthGuard` — khoá tạm 429 khi sai nhiều lần, cùng bộ đếm `reauth` với đổi mật khẩu/xoá tài khoản); đúng → xoá bộ đếm.
   */
  private async assertCurrentPassword(user: User, currentPassword: string | undefined): Promise<void> {
    if (!currentPassword) throw new AppError(ErrorMessages[ErrorCode.AUTH_021], 400, ErrorCode.AUTH_021);
    await this.reauthGuard?.assertNotLocked(user.id);
    if (!user.passwordHash) throw new ValidationError("Tài khoản này không có mật khẩu (đăng nhập qua bên thứ ba)");
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      await this.reauthGuard?.recordFailure(user.id);
      throw new UnauthorizedError("Mật khẩu hiện tại không đúng", ErrorCode.AUTH_001);
    }
    await this.reauthGuard?.reset(user.id);
  }

  /** Khoá tài khoản — thu hồi mọi session + credential sinh trắc học + đá socket + ghi audit. */
  async lock(id: string, actorId: string, reason: string): Promise<User> {
    if (id === actorId) throw new ValidationError("Không thể tự khoá tài khoản của chính mình");
    await this.assertLockToggleable(id, "khoá");
    const u = await this.repo.setStatus(id, "LOCKED");
    if (!u) throw new NotFoundError("Không tìm thấy người dùng");
    await this.sessions?.revokeAll(id, "ACCOUNT_LOCKED");
    await invalidateUserStatusCache(id);
    disconnectUserSockets(id, "account-locked");
    await this.audit?.record({
      actorId,
      action: "user.lock",
      targetType: "User",
      targetId: id,
      reason,
    });
    return this.sanitize(u);
  }

  /** Mở khoá tài khoản. */
  async unlock(id: string, actorId: string, reason: string): Promise<User> {
    await this.assertLockToggleable(id, "mở khoá");
    const u = await this.repo.setStatus(id, "ACTIVE");
    if (!u) throw new NotFoundError("Không tìm thấy người dùng");
    await invalidateUserStatusCache(id);
    await this.audit?.record({
      actorId,
      action: "user.unlock",
      targetType: "User",
      targetId: id,
      reason,
    });
    return this.sanitize(u);
  }

  /** Đổi role — không cho tự đổi role của chính mình; thu hồi session vì token cũ mang role cũ, ngắt socket đang mở. */
  async changeRole(id: string, role: RoleCode, actorId: string, reason: string): Promise<User> {
    if (id === actorId) throw new ValidationError("Không thể đổi vai trò của chính mình");
    const u = await this.repo.update(id, { role });
    if (!u) throw new NotFoundError("Không tìm thấy người dùng");
    await this.sessions?.revokeAll(id);
    await invalidateUserStatusCache(id);
    // Socket đang mở đã qua handshake với vai trò CŨ — ngắt để kết nối lại dưới vai trò mới (SEC-04; `update()` cũng làm vậy).
    disconnectUserSockets(id, "role-changed");
    await this.audit?.record({
      actorId,
      action: "user.change-role",
      targetType: "User",
      targetId: id,
      reason,
      metadata: { role },
    });
    return this.sanitize(u);
  }

  /**
   * (Deprecated — `DELETE /users/:id`) Yêu cầu xoá tài khoản chế độ GRACE (D-02).
   * Dùng CHUNG `beginDeletionGrace` với `POST /admin/users/:id/anonymize`: trước đây chỉ
   * đặt `status = PENDING_DELETION` mà KHÔNG ghi `deletionGraceUntil` nên tài khoản kẹt vĩnh
   * viễn (không đăng nhập, không huỷ được — `USER_011`, job `user.anonymize` không bao giờ nhặt).
   * Idempotent nếu đã chờ xoá.
   */
  async requestAnonymize(id: string, actorId: string, reason: string): Promise<User> {
    if (id === actorId) throw new SelfAnonymizeForbiddenError();
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError("Không tìm thấy người dùng");
    // Đã chờ xoá hoặc đã ẩn danh hoá ⇒ không đổi gì (idempotent) — tránh kéo tài khoản ANONYMIZED về PENDING_DELETION.
    if (existing.status !== "PENDING_DELETION" && existing.status !== "ANONYMIZED") {
      await this.beginDeletionGrace(id);
    }
    await this.audit?.record({
      actorId,
      action: "user.request-anonymize",
      targetType: "User",
      targetId: id,
      reason,
    });
    const updated = await this.repo.findById(id);
    return this.sanitize(updated ?? existing);
  }

  async delete(id: string): Promise<void> {
    const ok = await this.repo.delete(id);
    if (!ok) throw new NotFoundError("Không tìm thấy người dùng");
  }

  /**
   * Yêu cầu xoá tài khoản (D-02, be.md §5.4) — tự phục vụ (`POST
   * /me/delete-request`), cần mật khẩu hiện tại. Idempotent nếu đã
   * `PENDING_DELETION` (trả lại trạng thái hiện có thay vì lỗi).
   *
   * Vượt ra ngoài `IUserRepository` (CRUD 1 collection User) vì cần đọc field
   * không có trong `User` interface (`deletionGraceUntil`) và ghi 1 transaction
   * chéo User+OutboxEvent — dùng trực tiếp `prisma`/`withTransaction` như
   * `UserAnonymizer` (xem file đó) và như `SessionService` đã làm cho
   * `sessionVersion`. Đây là ngoại lệ hẹp cho đúng 2-3 nghiệp vụ này, không
   * phải mẫu chung cho toàn bộ `UserService`.
   */
  async requestDeletion(userId: string, password: string): Promise<DeletionStatusResult> {
    await this.reauthGuard?.assertNotLocked(userId);
    const record = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, status: true, deletionGraceUntil: true, email: true, role: true },
    });
    if (!record) throw new NotFoundError("Không tìm thấy người dùng");
    if (!record.passwordHash) {
      throw new ValidationError("Tài khoản này không có mật khẩu (đăng nhập qua bên thứ ba)");
    }
    const valid = await bcrypt.compare(password, record.passwordHash);
    if (!valid) {
      await this.reauthGuard?.recordFailure(userId);
      throw new UnauthorizedError("Mật khẩu không đúng", ErrorCode.AUTH_001);
    }
    await this.reauthGuard?.reset(userId);

    if (record.status === "PENDING_DELETION") {
      return { status: "PENDING_DELETION", deletionGraceUntil: record.deletionGraceUntil };
    }

    // be.md §5.4 bước 3 — registry rỗng ở Phase 0 (module workspace chưa tồn
    // tại) nên luôn cho qua; Phase 1 (p1-01) đăng ký guard thật, không cần
    // sửa lại chỗ này khi đó.
    await assertCanDeleteAccount(userId);

    const { deletionGraceUntil, deletionRequestedAt } = await this.beginDeletionGrace(userId);

    await this.audit?.record({
      actorId: userId,
      actorRole: record.role,
      action: "user.delete-request",
      targetType: "User",
      targetId: userId,
      reason: "self-service",
    });

    // be.md §5.4 bước 4 — qua `mailService.enqueueMail()` (KHÔNG qua outbox)
    // để giữ đúng retry=5/backoff 10s đặc tả ở §7: `outbox.relay` dispatch
    // generic không truyền lại `attempts`/`backoff` tuỳ biến theo job (chỉ có
    // `DEFAULT_JOB_OPTIONS` = attempts 3), nên ghi outbox sẽ âm thầm lùi về
    // retry 3. Đánh đổi: mất tính atomic với transaction (mail có thể không
    // gửi nếu crash đúng lúc này) — chấp nhận được vì đây không phải dữ liệu
    // nghiệp vụ phải bền tuyệt đối.
    mailService
      .enqueueMail(
        "user-delete-request",
        record.email,
        {
          deletionGraceUntil: deletionGraceUntil.toLocaleString("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
          }),
        },
        `${userId}:${deletionRequestedAt.getTime()}`
      )
      .catch((err) =>
        logger.warn("[UserService] Gửi mail yêu cầu xoá tài khoản thất bại", {
          userId,
          error: err instanceof Error ? err.message : String(err),
        })
      );

    return { status: "PENDING_DELETION", deletionGraceUntil };
  }

  /**
   * Huỷ yêu cầu xoá (tự phục vụ, `POST /me/delete-cancel`) — tài khoản đang
   * `PENDING_DELETION` bị `authenticateToken` chặn (`AUTH_012`) nên xác thực
   * lại bằng `email + password` thay vì access token (be.md §4).
   */
  async cancelDeletion(email: string, password: string): Promise<{ status: string }> {
    const normalizedEmail = normalizeEmail(email);
    await this.reauthGuard?.assertNotLocked(normalizedEmail);
    const record = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, passwordHash: true, status: true, deletionGraceUntil: true, role: true },
    });
    // Luôn chạy bcrypt (kể cả email lạ) để thời gian phản hồi không lộ email nào đã đăng ký.
    const valid = await bcrypt.compare(password, record?.passwordHash ?? TIMING_DUMMY_HASH);
    if (!record || !record.passwordHash || !valid) {
      await this.reauthGuard?.recordFailure(normalizedEmail);
      throw new UnauthorizedError("Email hoặc mật khẩu không đúng", ErrorCode.AUTH_001);
    }
    await this.reauthGuard?.reset(normalizedEmail);

    if (
      record.status !== "PENDING_DELETION" ||
      !record.deletionGraceUntil ||
      record.deletionGraceUntil <= new Date()
    ) {
      throw new DeletionNotPendingError();
    }

    await this.finishCancelDeletion(record.id);
    await this.audit?.record({
      actorId: record.id,
      actorRole: record.role,
      action: "user.delete-cancel",
      targetType: "User",
      targetId: record.id,
      reason: "self-service",
    });

    return { status: "ACTIVE" };
  }

  /**
   * Admin ẩn danh hoá (be.md §5.5 + endpoint mục 4, `POST
   * /admin/users/:id/anonymize`). `mode: "GRACE"` giống `requestDeletion`
   * (không cần mật khẩu, KHÔNG kiểm OWNER workspace — hook đó chỉ áp dụng
   * luồng tự phục vụ theo ma trận quyền be.md §6). `mode: "NOW"` gọi thẳng
   * `UserAnonymizer` (D-02), yêu cầu role `admin` + gõ đúng email xác nhận.
   */
  async anonymizeAdmin(
    targetId: string,
    actor: { id: string; role?: string },
    input: { mode: "GRACE" | "NOW"; reason: string; confirmEmail?: string }
  ): Promise<AnonymizeResult> {
    if (targetId === actor.id) throw new SelfAnonymizeForbiddenError();

    const user = await this.repo.findById(targetId);
    if (!user) throw new NotFoundError("Không tìm thấy người dùng");

    if (input.mode === "NOW") {
      // `requirePermission("user:delete")` ở route đã giới hạn admin (manager
      // không có quyền này) — kiểm lại ở service theo đúng be.md §4/§8, phòng
      // khi ma trận quyền role đổi sau này (defense in depth).
      if (actor.role !== ROLES.ADMIN) throw new AnonymizeNowForbiddenError();
      if (!input.confirmEmail || normalizeEmail(input.confirmEmail) !== normalizeEmail(user.email)) {
        throw new ConfirmEmailMismatchError();
      }

      const anonymizedAt = await this.anonymizer.anonymize(targetId);
      await this.audit?.record({
        actorId: actor.id,
        actorRole: actor.role,
        action: "user.anonymize",
        targetType: "User",
        targetId,
        reason: input.reason,
        metadata: { mode: "NOW" },
      });
      return { status: "ANONYMIZED", anonymizedAt };
    }

    // Đã ẩn danh hoá: KHÔNG kéo ngược về PENDING_DELETION (job `user.anonymize` sẽ nhặt lại mỗi ngày mà `anonymize()` thoát sớm theo
    // `anonymizedAt`, còn `cancelDeletionAdmin` biến tài khoản đã xoá thành ACTIVE "ma"). Idempotent — trả nguyên trạng.
    if (user.status === "ANONYMIZED") {
      const current = await prisma.user.findUnique({ where: { id: targetId }, select: { anonymizedAt: true } });
      return { status: "ANONYMIZED", anonymizedAt: current?.anonymizedAt ?? undefined };
    }

    // GRACE — idempotent nếu đã PENDING_DELETION.
    if (user.status === "PENDING_DELETION") {
      const current = await prisma.user.findUnique({
        where: { id: targetId },
        select: { deletionGraceUntil: true },
      });
      return {
        status: "PENDING_DELETION",
        deletionGraceUntil: current?.deletionGraceUntil ?? undefined,
      };
    }

    const { deletionGraceUntil } = await this.beginDeletionGrace(targetId);
    await this.audit?.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "user.anonymize",
      targetType: "User",
      targetId,
      reason: input.reason,
      metadata: { mode: "GRACE" },
    });
    return { status: "PENDING_DELETION", deletionGraceUntil };
  }

  /** Admin huỷ ẩn danh hoá đang chờ (`POST /admin/users/:id/anonymize/cancel`). */
  async cancelDeletionAdmin(
    targetId: string,
    actor: { id: string; role?: string },
    reason: string
  ): Promise<{ status: string }> {
    const record = await prisma.user.findUnique({
      where: { id: targetId },
      select: { status: true, deletionGraceUntil: true },
    });
    if (!record) throw new NotFoundError("Không tìm thấy người dùng");
    if (
      record.status !== "PENDING_DELETION" ||
      !record.deletionGraceUntil ||
      record.deletionGraceUntil <= new Date()
    ) {
      throw new DeletionNotPendingError();
    }

    await this.finishCancelDeletion(targetId);
    await this.audit?.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "user.anonymize-cancel",
      targetType: "User",
      targetId,
      reason,
    });

    return { status: "ACTIVE" };
  }

  /**
   * `PATCH /me/privacy` — merge từng phần vì `User.privacy` là embedded type
   * Mongo (`set` cả object, không merge field-by-field ở tầng DB).
   */
  async updatePrivacy(userId: string, patch: Partial<UserPrivacy>): Promise<UserPrivacy> {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundError("Không tìm thấy người dùng");

    const merged: UserPrivacy = {
      readReceipts: user.privacy?.readReceipts ?? true,
      showPresence: user.privacy?.showPresence ?? true,
      showInLeaderboard: user.privacy?.showInLeaderboard ?? true,
      showGamification: user.privacy?.showGamification ?? true,
      findableByEmail: user.privacy?.findableByEmail ?? true,
      findableByPhone: user.privacy?.findableByPhone ?? true,
      ...patch,
    };

    const updated = await this.repo.update(userId, { privacy: merged });
    if (!updated) throw new NotFoundError("Không tìm thấy người dùng");
    return merged;
  }

  /**
   * `PATCH /me/phone` — đặt/đổi/xoá (`null`) số điện thoại của CHÍNH MÌNH. `phone` đã được DTO chuẩn hoá E.164 (`phoneSchema`).
   * Số tự khai, KHÔNG xác minh và KHÔNG unique (chưa có OTP/SMS) — chỉ để người khác tìm/thêm vào nhóm; đọc lại để trả đúng giá trị đã lưu.
   */
  async updatePhone(userId: string, phone: string | null): Promise<{ phone: string | null }> {
    const updated = await this.repo.update(userId, { phone });
    if (!updated) throw new NotFoundError("Không tìm thấy người dùng");
    return { phone: updated.phone ?? null };
  }

  /**
   * Danh sách phiên đăng nhập của một user. `forOwner=false` (quản trị viên xem hộ)
   * ⇒ KHÔNG trả `deviceId` đầy đủ, chỉ `deviceIdMasked`.
   */
  async listSessions(
    userId: string,
    current?: CurrentSessionRef,
    forOwner = true
  ): Promise<UserSessionSummary[]> {
    const sessions = (await this.sessions?.listActive(userId, current)) ?? [];
    if (forOwner) return sessions;
    return sessions.map(({ deviceId, ...rest }) => ({
      ...rest,
      deviceIdMasked: deviceId ? maskDeviceId(deviceId) : null,
    }));
  }

  /**
   * Thu hồi 1 phiên đăng nhập của user (chính chủ hoặc quản trị viên có `user:update`) — ghi
   * audit `auth.session-revoke` và ngắt socket của user để thiết bị bị thu hồi mất kết nối ngay.
   */
  async revokeSession(
    sessionId: string,
    userId: string,
    current?: CurrentSessionRef,
    actor?: { id: string; role?: string; ip?: string; userAgent?: string }
  ): Promise<void> {
    await this.sessions?.revoke(sessionId, userId, current);
    disconnectUserSockets(userId, "session-revoked");
    await this.audit?.record({
      actorId: actor?.id ?? userId,
      actorRole: actor?.role,
      action: "auth.session-revoke",
      targetType: "User",
      targetId: userId,
      ip: actor?.ip,
      userAgent: actor?.userAgent,
      metadata: { sessionId },
    });
  }

  /**
   * (p0-13) Danh sách credential sinh trắc học của 1 user — admin
   * (`user:view`). Không import module `auth` — đi qua
   * `BiometricCredentialRevoker` (core/auth), giống lý do
   * `core/permission/user-status.ts` truy vấn thẳng `prisma.user`.
   */
  async listBiometricCredentials(
    userId: string,
    status: "ACTIVE" | "REVOKED" | "ALL"
  ): Promise<AdminBiometricCredentialDto[]> {
    return BiometricCredentialRevoker.adminListForUser(userId, status);
  }

  /** (p0-13) Admin thu hồi 1 credential sinh trắc học — idempotent + ghi audit. */
  async revokeBiometricCredential(
    userId: string,
    credentialId: string,
    actorId: string,
    reason: string
  ): Promise<void> {
    const ok = await BiometricCredentialRevoker.revokeOneForUser(
      userId,
      credentialId,
      "ADMIN",
      actorId
    );
    if (!ok) throw new NotFoundError("Không tìm thấy đăng nhập sinh trắc học");
    await this.audit?.record({
      actorId,
      action: "user.biometric-revoke",
      targetType: "User",
      targetId: userId,
      reason,
      metadata: { credentialId },
    });
  }

  /**
   * Chuyển 1 user sang `PENDING_DELETION` với mốc ân hạn
   * (`LIMITS.deletion.graceDays`) — dùng chung bởi `requestDeletion` (self) và
   * `anonymizeAdmin` (mode GRACE). Session + credential sinh trắc học thu hồi
   * qua port `SessionManager` (be.md ghi rõ "tái dùng CHÍNH port đó" —
   * `revokeAll` đã tự tăng `sessionVersion`); status + outbox
   * `user.session-invalidated` ghi ATOMIC trong 1 transaction riêng ngay sau
   * đó — không có race vì transaction chỉ ĐỌC LẠI `sessionVersion` (đã tăng ở
   * bước trên) để ghi vào `dedupeKey`, không tự tăng thêm lần nữa.
   */
  private async beginDeletionGrace(
    userId: string
  ): Promise<{ deletionRequestedAt: Date; deletionGraceUntil: Date }> {
    await this.sessions?.revokeAll(userId, "DELETION_REQUESTED");

    const now = new Date();
    const deletionGraceUntil = new Date(
      now.getTime() + LIMITS.deletion.graceDays * 24 * 60 * 60 * 1000
    );

    await withTransaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { status: "PENDING_DELETION", deletionRequestedAt: now, deletionGraceUntil },
        select: { sessionVersion: true },
      });
      await outbox.add(tx, {
        type: "user.session-invalidated",
        aggregateType: "User",
        aggregateId: userId,
        queue: "notifications",
        jobName: "realtime.disconnect-user",
        dedupeKey: `realtime.disconnect-user:user:${userId}:sv${updated.sessionVersion}`,
        payload: { userId, reason: "account-deletion-requested" },
      });
    });

    await invalidateUserStatusCache(userId);

    return { deletionRequestedAt: now, deletionGraceUntil };
  }

  /**
   * Khoá/mở khoá chỉ đổi qua lại ACTIVE ⇄ LOCKED. `PENDING_DELETION`/`ANONYMIZED` có vòng đời riêng (D-02): ghi đè bằng
   * `setStatus` làm `unlock` "hồi sinh" tài khoản đã xoá hoặc bỏ lại `deletionGraceUntil` mồ côi (app hiện banner chờ xoá dù
   * ACTIVE), còn `lock` chặn đứng job `user.anonymize` (chỉ nhặt `PENDING_DELETION`). Huỷ xoá đi qua `cancelDeletionAdmin`.
   */
  private async assertLockToggleable(id: string, action: "khoá" | "mở khoá"): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError("Không tìm thấy người dùng");
    if (existing.status === "ANONYMIZED") {
      throw new ConflictError(`Không thể ${action} tài khoản đã ẩn danh hoá`);
    }
    if (existing.status === "PENDING_DELETION") {
      throw new ConflictError(`Không thể ${action} tài khoản đang chờ xoá — hãy huỷ yêu cầu xoá trước`);
    }
  }

  /** Khôi phục `ACTIVE` — dùng chung bởi `cancelDeletion` (self) và `cancelDeletionAdmin`. */
  private async finishCancelDeletion(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { status: "ACTIVE", deletionRequestedAt: null, deletionGraceUntil: null },
    });
    await invalidateUserStatusCache(userId);
  }

  /** Bỏ `passwordHash`; thêm `avatarUrl` (URL ảnh hiển thị ký sẵn, `null` khi chưa đặt) — admin/app hiển thị thẳng. */
  private sanitize(u: User): User & { avatarUrl: string | null } {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...rest } = u;
    return { ...(rest as User), avatarUrl: avatarUrlOf(u.avatarAssetId) };
  }
}

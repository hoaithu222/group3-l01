import { Prisma } from "@prisma/client";
import type { IUserRepository, UserListParams } from "./user.repository.interface";
import type { User, UserCreateInput, UserUpdateInput } from "../entities/user.interface";
import type { RoleCode } from "../../../core/constants";
import { prisma } from "../../../infrastructure/database";
import { normalizeSearch } from "../../../core/utils/normalize";
import { normalizeEmail } from "../../../core/auth/normalize-email";
import { escapeRegex } from "../../../core/utils/escape-regex";
import { ConflictError } from "../../../core/exceptions";

/** Vi phạm unique index (`User.email`) — 2 request cùng đăng ký một email chạy đua qua khỏi bước `findByEmail`. */
function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

type UserRecord = {
  id: string;
  email: string;
  name: string;
  role: string | null;
  passwordHash: string | null;
  status: string;
  emailVerified: boolean;
  sessionVersion: number;
  avatarAssetId: string | null;
  phone: string | null;
  privacy: {
    readReceipts: boolean;
    showPresence: boolean;
    showInLeaderboard: boolean | null;
    showGamification: boolean | null;
    findableByEmail: boolean | null;
    findableByPhone: boolean | null;
  } | null;
  deletionGraceUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * PrismaUserRepository — implements IUserRepository dùng PrismaClient.
 * Map Prisma User model sang User interface.
 */
export class PrismaUserRepository implements IUserRepository {
  /** Map Prisma record → app User interface */
  private static mapUser(record: UserRecord): User {
    return {
      id: record.id,
      email: record.email,
      name: record.name,
      role: (record.role as RoleCode | undefined) ?? undefined,
      passwordHash: record.passwordHash ?? undefined,
      status: record.status,
      emailVerified: record.emailVerified,
      sessionVersion: record.sessionVersion,
      avatarAssetId: record.avatarAssetId,
      phone: record.phone ?? null,
      privacy: record.privacy,
      deletionGraceUntil: record.deletionGraceUntil,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  async findById(id: string): Promise<User | null> {
    const record = await prisma.user.findUnique({ where: { id } });
    return record ? PrismaUserRepository.mapUser(record) : null;
  }

  /** Tra theo email ĐÃ CHUẨN HOÁ (chữ thường) — xem `normalizeEmail`. */
  async findByEmail(email: string): Promise<User | null> {
    const record = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
    return record ? PrismaUserRepository.mapUser(record) : null;
  }

  async findMany(limit = 10, offset = 0): Promise<{ data: User[]; total: number }> {
    const [records, total] = await prisma.$transaction([
      prisma.user.findMany({ skip: offset, take: limit, orderBy: { createdAt: "desc" } }),
      prisma.user.count(),
    ]);
    return { data: records.map(PrismaUserRepository.mapUser), total };
  }

  /** Danh sách có lọc theo từ khoá (không dấu), role, status — dùng cho admin. */
  async findManyFiltered(params: UserListParams): Promise<{ data: User[]; total: number }> {
    const { limit, offset, q, role, status } = params;
    const where: Prisma.UserWhereInput = {
      ...(q && {
        OR: [
          // Prisma+Mongo dịch `contains` thành `$regex` KHÔNG escape — bọc `escapeRegex` (chống ReDoS/regex injection).
          { normalizedName: { contains: escapeRegex(normalizeSearch(q)) } },
          { email: { contains: escapeRegex(q.toLowerCase()) } },
        ],
      }),
      ...(role && { role }),
      ...(status && { status: status as Prisma.EnumUserStatusFilter["equals"] }),
    };
    const [records, total] = await prisma.$transaction([
      prisma.user.findMany({ where, skip: offset, take: limit, orderBy: { createdAt: "desc" } }),
      prisma.user.count({ where }),
    ]);
    return { data: records.map(PrismaUserRepository.mapUser), total };
  }

  async create(input: UserCreateInput): Promise<User> {
    try {
      const record = await prisma.user.create({
        data: {
          email: normalizeEmail(input.email),
          name: input.name,
          normalizedName: normalizeSearch(input.name),
          role: (input.role as string | undefined) ?? "user",
          passwordHash: input.passwordHash ?? null,
          // Ghi null TƯỜNG MINH: Prisma+Mongo không khớp `{ phone: null }` với field vắng mặt (bộ lọc `phone: null` về sau).
          phone: input.phone ?? null,
          // Email đã được nhà cung cấp danh tính (Google…) xác minh — đăng ký bằng mật khẩu thì luôn chưa xác minh.
          ...(input.emailVerified === true && { emailVerified: true, emailVerifiedAt: new Date() }),
        },
      });
      return PrismaUserRepository.mapUser(record);
    } catch (err) {
      // Race đăng ký cùng email: `findByEmail` ở service không đủ (kiểm-rồi-ghi không nguyên tử).
      if (isUniqueViolation(err)) throw new ConflictError("Email đã tồn tại");
      throw err;
    }
  }

  async update(id: string, input: UserUpdateInput): Promise<User | null> {
    try {
      const record = await prisma.user.update({
        where: { id },
        data: {
          ...(input.email !== undefined && { email: normalizeEmail(input.email) }),
          // Email đổi ⇒ chưa xác minh; xoá mốc/mã xác minh của email cũ.
          ...(input.emailVerified === false && {
            emailVerified: false,
            emailVerifiedAt: null,
            verificationToken: null,
            verificationTokenExpires: null,
          }),
          // Nhà cung cấp danh tính (Google…) đã chứng minh sở hữu email ⇒ đánh dấu đã xác minh, huỷ mã xác minh còn treo.
          ...(input.emailVerified === true && {
            emailVerified: true,
            emailVerifiedAt: new Date(),
            verificationToken: null,
            verificationTokenExpires: null,
          }),
          ...(input.name !== undefined && {
            name: input.name,
            normalizedName: normalizeSearch(input.name),
          }),
          ...(input.role !== undefined && { role: input.role }),
          ...(input.passwordHash !== undefined && { passwordHash: input.passwordHash }),
          ...(input.avatarAssetId !== undefined && { avatarAssetId: input.avatarAssetId }),
          ...(input.phone !== undefined && { phone: input.phone }),
          ...(input.privacy !== undefined && { privacy: input.privacy }),
        },
      });
      return PrismaUserRepository.mapUser(record);
    } catch (err) {
      // P2025 = "Record to update not found" → return null (expected)
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        return null;
      }
      // P2002 = đổi sang email đã có người dùng → 409 thay vì 500
      if (isUniqueViolation(err)) throw new ConflictError("Email đã tồn tại");
      throw err; // DB connection error, other constraint violation, etc. → propagate
    }
  }

  /** Đổi trạng thái tài khoản (ACTIVE/LOCKED/PENDING_DELETION/ANONYMIZED). */
  async setStatus(id: string, status: string): Promise<User | null> {
    try {
      const record = await prisma.user.update({
        where: { id },
        data: { status: status as Prisma.EnumUserStatusFieldUpdateOperationsInput["set"] },
      });
      return PrismaUserRepository.mapUser(record);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        return null;
      }
      throw err;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.user.delete({ where: { id } });
      return true;
    } catch (err) {
      // P2025 = "Record to delete not found" → return false (expected)
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        return false;
      }
      throw err; // DB connection error, etc. → propagate
    }
  }
}

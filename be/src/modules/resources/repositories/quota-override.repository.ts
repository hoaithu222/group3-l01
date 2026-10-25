import { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { VersionConflictError } from "../../../core/exceptions";

/** Khoá `SystemConfig` chứa hạn mức riêng theo workspace (`SYSTEM_CONFIG_REGISTRY.resource`, p3-01 README §7). */
export const QUOTA_OVERRIDE_CONFIG_KEY = "resource";

export interface QuotaOverrideEntry {
  workspaceId: string;
  bytes: number;
}

export interface QuotaOverrideWriteResult {
  entries: QuotaOverrideEntry[];
  /** Giá trị + phiên bản mới của khoá — để caller làm mới cache `runtimeConfig` sau commit. */
  value: Record<string, unknown>;
  version: number;
}

/**
 * Ghi `resource.quotaOverrides` (thêm/sửa/xoá 1 dòng) — cùng collection `SystemConfig` mà module `system-config` quản lý
 * nhưng CHỈ chạm khoá `resource`, đọc-sửa-ghi có kiểm phiên bản (CAS) và tự thử lại khi tranh chấp, nên hai admin đặt
 * hạn mức cho 2 nhóm khác nhau cùng lúc không đè nhau.
 */
export interface IQuotaOverrideRepository {
  update(
    mutate: (current: QuotaOverrideEntry[]) => QuotaOverrideEntry[],
    meta: { actorId: string; reason: string }
  ): Promise<QuotaOverrideWriteResult>;
}

const MAX_ATTEMPTS = 5;

function readEntries(value: unknown): QuotaOverrideEntry[] {
  const list = (value as { quotaOverrides?: unknown } | null)?.quotaOverrides;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (e): e is QuotaOverrideEntry =>
      typeof e === "object" && e !== null && typeof (e as QuotaOverrideEntry).workspaceId === "string" && typeof (e as QuotaOverrideEntry).bytes === "number"
  );
}

export class PrismaQuotaOverrideRepository implements IQuotaOverrideRepository {
  async update(
    mutate: (current: QuotaOverrideEntry[]) => QuotaOverrideEntry[],
    meta: { actorId: string; reason: string }
  ): Promise<QuotaOverrideWriteResult> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const doc = await prisma.systemConfig.findUnique({ where: { key: QUOTA_OVERRIDE_CONFIG_KEY } });
      const entries = mutate(readEntries(doc?.value));
      const value = { ...((doc?.value as Record<string, unknown> | null) ?? {}), quotaOverrides: entries };

      if (!doc) {
        try {
          await prisma.systemConfig.create({
            data: { key: QUOTA_OVERRIDE_CONFIG_KEY, value: value as unknown as Prisma.InputJsonValue, version: 1, updatedBy: meta.actorId, reason: meta.reason },
          });
          return { entries, value, version: 1 };
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue; // admin khác vừa tạo — đọc lại
          throw err;
        }
      }

      const result = await prisma.systemConfig.updateMany({
        where: { key: QUOTA_OVERRIDE_CONFIG_KEY, version: doc.version },
        data: { value: value as unknown as Prisma.InputJsonValue, version: { increment: 1 }, updatedBy: meta.actorId, reason: meta.reason },
      });
      if (result.count === 1) return { entries, value, version: doc.version + 1 };
    }
    throw new VersionConflictError(0);
  }
}

export class InMemoryQuotaOverrideRepository implements IQuotaOverrideRepository {
  entries: QuotaOverrideEntry[] = [];
  version = 0;

  update(
    mutate: (current: QuotaOverrideEntry[]) => QuotaOverrideEntry[]
  ): Promise<QuotaOverrideWriteResult> {
    this.entries = mutate([...this.entries]);
    this.version += 1;
    return Promise.resolve({ entries: this.entries, value: { quotaOverrides: this.entries }, version: this.version });
  }
}

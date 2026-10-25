import type { SystemConfigRecord } from "../entities/system-config.interface";
import type {
  ISystemConfigRepository,
  UpsertSystemConfigInput,
  UpsertSystemConfigResult,
} from "./system-config.repository.interface";

/**
 * In-memory — dùng cho unit test `SystemConfigService` (CFG-05: version lệch
 * → conflict; tạo mới khi chưa có). KHÔNG ghi outbox/broadcast (chi tiết hạ
 * tầng của bản Prisma) — test dùng repo này chỉ kiểm nghiệp vụ version.
 */
export class InMemorySystemConfigRepository implements ISystemConfigRepository {
  private store = new Map<string, SystemConfigRecord>();

  static clearAll(instance: InMemorySystemConfigRepository): void {
    instance.store.clear();
  }

  async findByKey(key: string): Promise<SystemConfigRecord | null> {
    return this.store.get(key) ?? null;
  }

  async findAll(): Promise<SystemConfigRecord[]> {
    return [...this.store.values()];
  }

  async upsertWithVersionCheck(input: UpsertSystemConfigInput): Promise<UpsertSystemConfigResult> {
    const existing = this.store.get(input.key) ?? null;

    if (!existing) {
      if (input.expectedVersion !== 0) return { conflict: true, current: null };
      const record: SystemConfigRecord = {
        key: input.key,
        value: input.value,
        version: 1,
        updatedBy: input.updatedBy,
        reason: input.reason,
        updatedAt: new Date(),
      };
      this.store.set(input.key, record);
      return { conflict: false, record };
    }

    if (existing.version !== input.expectedVersion) return { conflict: true, current: existing };

    const record: SystemConfigRecord = {
      key: input.key,
      value: input.value,
      version: existing.version + 1,
      updatedBy: input.updatedBy,
      reason: input.reason,
      updatedAt: new Date(),
    };
    this.store.set(input.key, record);
    return { conflict: false, record };
  }
}

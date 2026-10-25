import type { SystemConfigRecord } from "../entities/system-config.interface";

export interface UpsertSystemConfigInput {
  key: string;
  value: Record<string, unknown>;
  expectedVersion: number;
  updatedBy: string;
  reason: string;
}

export type UpsertSystemConfigResult =
  | { conflict: true; current: SystemConfigRecord | null }
  | { conflict: false; record: SystemConfigRecord };

export interface ISystemConfigRepository {
  findByKey(key: string): Promise<SystemConfigRecord | null>;
  /** Mọi document đã có override (danh sách trống với khoá chưa từng ghi — service tự bổ sung "chỉ mặc định" cho khoá còn lại trong registry). */
  findAll(): Promise<SystemConfigRecord[]>;
  /**
   * Optimistic concurrency: tạo mới nếu chưa có document (chỉ khi
   * `expectedVersion === 0`) hoặc update khi `version` khớp — tăng version,
   * ghi `updatedBy`/`reason`. Cài đặt Prisma BẮT BUỘC ghi kèm `OutboxEvent
   * type=config.changed` TRONG CÙNG transaction (be.md §5.1 bước 5) —
   * KHÔNG lộ ra interface này (chi tiết hạ tầng).
   */
  upsertWithVersionCheck(input: UpsertSystemConfigInput): Promise<UpsertSystemConfigResult>;
}

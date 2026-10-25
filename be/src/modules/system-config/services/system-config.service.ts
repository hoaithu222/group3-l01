import {
  SystemConfigNotFoundError,
  SystemConfigOutOfRangeError,
  FeatureNotAvailableError,
  FeatureBlockedError,
  ValidationError,
  VersionConflictError,
} from "../../../core/exceptions";
import { SYSTEM_CONFIG_REGISTRY, type ConfigField, type ConfigKeyDef } from "../../../core/config/system-config.registry";
import { runtimeConfig } from "../../../core/config/runtime-config";
import { env } from "../../../core/config";
import { AVAILABLE_MODULES, AI_BLOCKED, MODULES, SUB_FEATURE_IDS, type ModuleId, type SubFeatureId } from "../../../core/constants/modules";
import type { ISystemConfigRepository } from "../repositories/system-config.repository.interface";
import type { SystemConfigRecord } from "../entities/system-config.interface";

/** Cổng ghi audit log — thoả mãn bởi `AuditService` (module audit-log) qua structural typing, giống `admin-jobs.service.ts`. */
export interface AuditRecorder {
  record(input: {
    actorId: string;
    actorRole?: string;
    action: string;
    targetType: string;
    targetId: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface SystemConfigActor {
  id: string;
  role?: string;
}

export interface SystemConfigFieldDto {
  path: string;
  label: string;
  kind: ConfigField["kind"];
  default: unknown;
  floor?: number;
  ceil?: number;
  unit?: ConfigField["unit"];
  /** Chỉ kind "enum" — danh sách giá trị hợp lệ. */
  options?: readonly string[];
}

export interface SystemConfigDto {
  key: string;
  tab: ConfigKeyDef["tab"];
  label: string;
  fields: SystemConfigFieldDto[];
  /** Giá trị override thô đang lưu (`{}` nếu chưa từng ghi/đã reset). */
  stored: Record<string, unknown>;
  /** Giá trị hiệu lực (default registry ⊕ override, đã clamp) — dùng để preview. */
  effective: Record<string, unknown>;
  version: number;
  updatedAt: Date | null;
  updatedBy: string | null;
}

const LIVEKIT_DEPENDENT_MODULES = new Set<ModuleId>([MODULES.VOICE, MODULES.MEETING]);

function hasLiveKitEnv(): boolean {
  return !!(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);
}

function resolveCeil(field: ConfigField): number | undefined {
  return typeof field.ceil === "function" ? field.ceil() : field.ceil;
}

/** Đọc giá trị field theo `path` (hỗ trợ 1-2 cấp lồng) trong object đã parse. */
function readPath(obj: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, seg) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[seg] : undefined),
      obj
    );
}

export class SystemConfigService {
  constructor(
    private readonly repo: ISystemConfigRepository,
    private readonly audit?: AuditRecorder
  ) {}

  async list(): Promise<SystemConfigDto[]> {
    const [records, keys] = await Promise.all([
      this.repo.findAll(),
      Promise.resolve(Object.keys(SYSTEM_CONFIG_REGISTRY)),
    ]);
    const byKey = new Map(records.map((r) => [r.key, r]));
    return Promise.all(keys.map((key) => this.toDto(SYSTEM_CONFIG_REGISTRY[key], byKey.get(key) ?? null)));
  }

  async getOne(key: string): Promise<SystemConfigDto> {
    const def = this.requireDef(key);
    const record = await this.repo.findByKey(key);
    return this.toDto(def, record);
  }

  async update(
    key: string,
    input: { value: Record<string, unknown>; expectedVersion: number; reason: string },
    actor: SystemConfigActor
  ): Promise<SystemConfigDto> {
    const def = this.requireDef(key);
    const parsed = this.validateValue(def, input.value);

    const result = await this.repo.upsertWithVersionCheck({
      key,
      value: parsed,
      expectedVersion: input.expectedVersion,
      updatedBy: actor.id,
      reason: input.reason,
    });
    if (result.conflict) throw new VersionConflictError(result.current?.version ?? 0);

    await this.afterWrite(key, result.record, actor, input.reason, "system-config.update");
    return this.toDto(def, result.record);
  }

  async reset(
    key: string,
    input: { expectedVersion: number; reason: string },
    actor: SystemConfigActor
  ): Promise<SystemConfigDto> {
    const def = this.requireDef(key);

    const result = await this.repo.upsertWithVersionCheck({
      key,
      value: {},
      expectedVersion: input.expectedVersion,
      updatedBy: actor.id,
      reason: input.reason,
    });
    if (result.conflict) throw new VersionConflictError(result.current?.version ?? 0);

    await this.afterWrite(key, result.record, actor, input.reason, "system-config.reset");
    return this.toDto(def, result.record);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private requireDef(key: string): ConfigKeyDef {
    const def = SYSTEM_CONFIG_REGISTRY[key];
    if (!def) throw new SystemConfigNotFoundError();
    return def;
  }

  /** be.md §5.1 bước 2–4: schema Zod → floor/ceil từng field → luật riêng khoá `features`. */
  private validateValue(def: ConfigKeyDef, value: Record<string, unknown>): Record<string, unknown> {
    const parsed = def.schema.safeParse(value);
    if (!parsed.success) {
      throw new ValidationError("Dữ liệu cấu hình không hợp lệ", parsed.error.flatten().fieldErrors);
    }
    const data = parsed.data as Record<string, unknown>;

    for (const field of def.fields) {
      const v = readPath(data, field.path);
      if (v === undefined) continue;
      if ((field.kind === "int" || field.kind === "bytes") && typeof v === "number") {
        const floor = field.floor;
        const ceil = resolveCeil(field);
        if ((typeof floor === "number" && v < floor) || (typeof ceil === "number" && v > ceil)) {
          throw new SystemConfigOutOfRangeError({ path: field.path, floor, ceil });
        }
      }
    }

    if (def.key === "features") {
      for (const [m, on] of Object.entries(data)) {
        if (on !== true) continue;
        // Cờ phụ của tiện ích (p5-04) không phải phân hệ: không có "mã/chưa có mã" hay chặn D-13 — hiệu lực theo phân hệ cha lúc chạy.
        if ((SUB_FEATURE_IDS as readonly string[]).includes(m as SubFeatureId)) continue;
        const moduleId = m as ModuleId;
        if (AI_BLOCKED.has(moduleId)) throw new FeatureBlockedError();
        if (!AVAILABLE_MODULES.includes(moduleId)) throw new FeatureNotAvailableError("not-available");
        if (LIVEKIT_DEPENDENT_MODULES.has(moduleId) && !hasLiveKitEnv()) {
          throw new FeatureNotAvailableError("missing-env");
        }
      }
    }

    return data;
  }

  private async afterWrite(
    key: string,
    record: SystemConfigRecord,
    actor: SystemConfigActor,
    reason: string,
    action: string
  ): Promise<void> {
    // Sau commit: SET cache Redis với giá trị mới + PUBLISH cho instance khác
    // (be.md §5.1 bước 6) — lỗi Redis chỉ log warn, không chặn response đã commit.
    await runtimeConfig.publishInvalidate(key, { value: record.value, version: record.version });

    // Audit SAU transaction (không "trong cùng tx" như be.md §5.1 bước 5 mô tả
    // lý tưởng — `AuditService.record()` hiện không nhận `tx`, xem be.md §11
    // "ghi chú lệch kế hoạch", cùng cách `admin-jobs.service.ts` đã làm).
    await this.audit?.record({
      actorId: actor.id,
      actorRole: actor.role,
      action,
      targetType: "SystemConfig",
      targetId: key,
      reason,
      metadata: { value: record.value, version: record.version },
    });
  }

  private async toDto(def: ConfigKeyDef, record: SystemConfigRecord | null): Promise<SystemConfigDto> {
    const effective = await runtimeConfig.getEffective(def.key);
    return {
      key: def.key,
      tab: def.tab,
      label: def.label,
      fields: def.fields.map((f) => ({
        path: f.path,
        label: f.label,
        kind: f.kind,
        default: f.default,
        floor: f.floor,
        ceil: resolveCeil(f),
        unit: f.unit,
        ...(f.options && { options: f.options }),
      })),
      stored: record?.value ?? {},
      effective,
      version: record?.version ?? 0,
      updatedAt: record?.updatedAt ?? null,
      updatedBy: record?.updatedBy ?? null,
    };
  }
}

import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database";
import { logger } from "../../infrastructure/logger";
import { templateChannelsSchema, type TemplateChannelDef } from "./workspace-templates.validators";

export interface TemplateRecord {
  id: string;
  code: string;
  name: string;
  description: string;
  channels: TemplateChannelDef[];
  isActive: boolean;
  order: number;
  version: number;
  updatedBy: string | null;
  updatedAt: Date;
}

export interface ApplicationRecord {
  id: string;
  workspaceId: string;
  templateCode: string;
  channelKeys: string[];
  createdChannelIds: string[];
  skippedKeys: string[];
  appliedBy: string;
  idempotencyKey: string;
  createdAt: Date;
}

export interface TemplatePatch {
  name?: string;
  description?: string;
  isActive?: boolean;
  order?: number;
  channels?: TemplateChannelDef[];
}

export type TemplateUpdateResult = { ok: true; record: TemplateRecord } | { ok: false; current: TemplateRecord | null };

export interface WorkspaceChannelState {
  /** `null` khi workspace không tồn tại. */
  status: "ACTIVE" | "ARCHIVED" | null;
  /** `normalizedName` của MỌI kênh (cả ARCHIVED — tên vẫn bị giữ, unique `[workspaceId, normalizedName]`). */
  normalizedNames: Set<string>;
  activeChannelCount: number;
}

export interface IWorkspaceTemplateRepository {
  listActive(): Promise<TemplateRecord[]>;
  listAll(): Promise<TemplateRecord[]>;
  findByCode(code: string): Promise<TemplateRecord | null>;
  /** So-và-đổi theo `version` (optimistic concurrency); không khớp → `{ ok:false, current }`. */
  update(code: string, expectedVersion: number, patch: TemplatePatch, updatedBy: string): Promise<TemplateUpdateResult>;
  /** Tạo mẫu nếu CHƯA có (giữ nguyên bản admin đã sửa); `overwrite` → ghi đè nội dung + tăng version. Trả `"created" | "updated" | "kept"`. */
  seed(def: SeedTemplate, overwrite: boolean): Promise<"created" | "updated" | "kept">;
  findApplication(appliedBy: string, idempotencyKey: string): Promise<ApplicationRecord | null>;
  /** Ghi nhật ký áp mẫu; trùng `(appliedBy, idempotencyKey)` (yêu cầu song song) → trả bản đã có. */
  createApplication(input: Omit<ApplicationRecord, "id" | "createdAt">): Promise<ApplicationRecord>;
  workspaceChannelState(workspaceId: string): Promise<WorkspaceChannelState>;
}

export interface SeedTemplate {
  code: string;
  name: string;
  description: string;
  channels: TemplateChannelDef[];
  order: number;
}

type TemplateRow = Awaited<ReturnType<typeof prisma.workspaceTemplate.findFirstOrThrow>>;

function mapTemplate(row: TemplateRow): TemplateRecord {
  const parsed = templateChannelsSchema.safeParse(row.channels);
  if (!parsed.success) logger.warn("[workspace-templates] Dữ liệu kênh của mẫu không hợp lệ, coi như rỗng", { code: row.code });
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    channels: parsed.success ? parsed.data : [],
    isActive: row.isActive,
    order: row.order,
    version: row.version,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
  };
}

const isUniqueViolation = (err: unknown): boolean => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

export class PrismaWorkspaceTemplateRepository implements IWorkspaceTemplateRepository {
  async listActive(): Promise<TemplateRecord[]> {
    const rows = await prisma.workspaceTemplate.findMany({ where: { isActive: true }, orderBy: [{ order: "asc" }, { code: "asc" }] });
    return rows.map(mapTemplate);
  }

  async listAll(): Promise<TemplateRecord[]> {
    const rows = await prisma.workspaceTemplate.findMany({ orderBy: [{ order: "asc" }, { code: "asc" }] });
    return rows.map(mapTemplate);
  }

  async findByCode(code: string): Promise<TemplateRecord | null> {
    const row = await prisma.workspaceTemplate.findUnique({ where: { code } });
    return row ? mapTemplate(row) : null;
  }

  async update(code: string, expectedVersion: number, patch: TemplatePatch, updatedBy: string): Promise<TemplateUpdateResult> {
    const result = await prisma.workspaceTemplate.updateMany({
      where: { code, version: expectedVersion },
      data: {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.description !== undefined && { description: patch.description }),
        ...(patch.isActive !== undefined && { isActive: patch.isActive }),
        ...(patch.order !== undefined && { order: patch.order }),
        ...(patch.channels !== undefined && { channels: patch.channels as unknown as Prisma.InputJsonValue }),
        updatedBy,
        version: { increment: 1 },
      },
    });
    const current = await this.findByCode(code);
    return result.count === 1 && current ? { ok: true, record: current } : { ok: false, current };
  }

  async seed(def: SeedTemplate, overwrite: boolean): Promise<"created" | "updated" | "kept"> {
    const existing = await prisma.workspaceTemplate.findUnique({ where: { code: def.code } });
    const channels = def.channels as unknown as Prisma.InputJsonValue;
    if (!existing) {
      await prisma.workspaceTemplate.create({
        data: { code: def.code, name: def.name, description: def.description, channels, order: def.order, isActive: true, version: 1, updatedBy: null },
      });
      return "created";
    }
    if (!overwrite) return "kept";
    await prisma.workspaceTemplate.update({
      where: { code: def.code },
      data: { name: def.name, description: def.description, channels, order: def.order, version: { increment: 1 } },
    });
    return "updated";
  }

  async findApplication(appliedBy: string, idempotencyKey: string): Promise<ApplicationRecord | null> {
    const row = await prisma.workspaceTemplateApplication.findUnique({ where: { appliedBy_idempotencyKey: { appliedBy, idempotencyKey } } });
    return row ? { ...row } : null;
  }

  async createApplication(input: Omit<ApplicationRecord, "id" | "createdAt">): Promise<ApplicationRecord> {
    try {
      const row = await prisma.workspaceTemplateApplication.create({ data: input });
      return { ...row };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const existing = await this.findApplication(input.appliedBy, input.idempotencyKey);
      if (!existing) throw err;
      return existing;
    }
  }

  async workspaceChannelState(workspaceId: string): Promise<WorkspaceChannelState> {
    const [workspace, channels] = await Promise.all([
      prisma.workspace.findUnique({ where: { id: workspaceId }, select: { status: true } }),
      prisma.channel.findMany({ where: { workspaceId }, select: { normalizedName: true, status: true } }),
    ]);
    return {
      status: workspace ? (workspace.status === "ACTIVE" ? "ACTIVE" : "ARCHIVED") : null,
      normalizedNames: new Set(channels.map((c) => c.normalizedName)),
      activeChannelCount: channels.filter((c) => c.status === "ACTIVE").length,
    };
  }
}

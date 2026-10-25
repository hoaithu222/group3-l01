import { Prisma, type Integration } from "@prisma/client";
import { isSealedSecret, type SealedSecret } from "../../../core/utils/crypto";
import type { IntegrationProviderValue, IntegrationTargetScopeType } from "../../../core/constants/integration";
import { prisma, withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { EMPTY_INTEGRATION_CONFIG, type IntegrationConfig, type IntegrationEntity } from "../entities/integration.interface";
import type {
  AdminIntegrationFilter,
  IIntegrationRepository,
  IntegrationPatch,
  ProviderStatRow,
  UpsertIntegrationInput,
} from "./integration.repository.interface";

function parseConfig(raw: Prisma.JsonValue): IntegrationConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ...EMPTY_INTEGRATION_CONFIG };
  const c = raw as { repos?: unknown; events?: unknown };
  const repos = Array.isArray(c.repos)
    ? c.repos.filter((r): r is { id: string; fullName: string } => typeof r === "object" && r !== null && typeof (r as { id?: unknown }).id === "string" && typeof (r as { fullName?: unknown }).fullName === "string")
    : [];
  const events = Array.isArray(c.events) ? c.events.filter((e): e is string => typeof e === "string") : [];
  return { repos: repos.map((r) => ({ id: r.id, fullName: r.fullName })), events };
}

export function toIntegrationEntity(row: Integration): IntegrationEntity {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    provider: row.provider,
    externalAccountId: row.externalAccountId,
    externalName: row.externalName,
    credentials: isSealedSecret(row.credentials) ? row.credentials : null,
    tokenExpiresAt: row.tokenExpiresAt,
    scopes: row.scopes,
    config: parseConfig(row.config),
    targetScopeType: row.targetScopeType as IntegrationTargetScopeType,
    targetScopeId: row.targetScopeId,
    webhookSecretHash: row.webhookSecretHash,
    externalHookIds: row.externalHookIds,
    status: row.status,
    statusReason: row.statusReason,
    createdBy: row.createdBy,
    lastEventAt: row.lastEventAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const json = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;
const sealed = (v: SealedSecret | null): Prisma.InputJsonValue | null => (v ? json(v) : null);

function toData(patch: IntegrationPatch): Prisma.IntegrationUpdateInput {
  return {
    ...(patch.config !== undefined && { config: json(patch.config) }),
    ...(patch.createdBy !== undefined && { createdBy: patch.createdBy }),
    ...(patch.targetScopeType !== undefined && { targetScopeType: patch.targetScopeType }),
    ...(patch.targetScopeId !== undefined && { targetScopeId: patch.targetScopeId }),
    ...(patch.externalHookIds !== undefined && { externalHookIds: { set: patch.externalHookIds } }),
    ...(patch.webhookSecretHash !== undefined && { webhookSecretHash: patch.webhookSecretHash }),
    ...(patch.status !== undefined && { status: patch.status }),
    ...(patch.statusReason !== undefined && { statusReason: patch.statusReason }),
  };
}

export class PrismaIntegrationRepository implements IIntegrationRepository {
  async findById(id: string): Promise<IntegrationEntity | null> {
    const row = await prisma.integration.findUnique({ where: { id } });
    return row ? toIntegrationEntity(row) : null;
  }

  async listByWorkspace(workspaceId: string): Promise<IntegrationEntity[]> {
    const rows = await prisma.integration.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
    return rows.map(toIntegrationEntity);
  }

  countByWorkspace(workspaceId: string): Promise<number> {
    return prisma.integration.count({ where: { workspaceId } });
  }

  async findByExternal(provider: IntegrationProviderValue, externalAccountId: string): Promise<IntegrationEntity[]> {
    const rows = await prisma.integration.findMany({ where: { provider, externalAccountId } });
    return rows.map(toIntegrationEntity);
  }

  async findByWebhookSecretHash(hash: string): Promise<IntegrationEntity | null> {
    const row = await prisma.integration.findFirst({ where: { webhookSecretHash: hash } });
    return row ? toIntegrationEntity(row) : null;
  }

  async upsert(input: UpsertIntegrationInput): Promise<{ entity: IntegrationEntity; created: boolean }> {
    try {
      return await this.upsertOnce(input);
    } catch (err) {
      // Hai lần kết nối đồng thời cùng khoá: bên thua gặp P2002 (transaction đã abort) → chạy lại, lần này thấy hàng có sẵn và cập nhật.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return this.upsertOnce(input);
      throw err;
    }
  }

  private upsertOnce(input: UpsertIntegrationInput): Promise<{ entity: IntegrationEntity; created: boolean }> {
    return withTransaction(async (tx) => {
      const { workspaceId, provider, externalAccountId } = input;
      const existing = await tx.integration.findFirst({ where: { workspaceId, provider, externalAccountId } });
      const row = existing
        ? await tx.integration.update({
            where: { id: existing.id },
            data: {
              externalName: input.externalName,
              credentials: sealed(input.credentials),
              tokenExpiresAt: input.tokenExpiresAt,
              scopes: { set: input.scopes },
              ...(input.webhookSecretHash !== null && { webhookSecretHash: input.webhookSecretHash }),
              status: "ACTIVE",
              statusReason: null,
              version: { increment: 1 },
            },
          })
        : await tx.integration.create({
            data: {
              workspaceId,
              provider,
              externalAccountId,
              externalName: input.externalName,
              credentials: sealed(input.credentials),
              tokenExpiresAt: input.tokenExpiresAt,
              scopes: input.scopes,
              config: json(input.config),
              targetScopeType: input.targetScopeType,
              targetScopeId: input.targetScopeId,
              webhookSecretHash: input.webhookSecretHash,
              externalHookIds: [],
              status: "ACTIVE",
              statusReason: null,
              createdBy: input.createdBy,
              lastEventAt: null,
            },
          });
      for (const event of input.outbox?.(row.id) ?? []) await outbox.add(tx, event);
      return { entity: toIntegrationEntity(row), created: !existing };
    });
  }

  async updateWithVersion(id: string, expectedVersion: number, patch: IntegrationPatch): Promise<IntegrationEntity | null> {
    const res = await prisma.integration.updateMany({
      where: { id, version: expectedVersion },
      data: { ...(toData(patch) as Prisma.IntegrationUpdateManyMutationInput), version: { increment: 1 } },
    });
    return res.count === 0 ? null : this.findById(id);
  }

  async patch(id: string, patch: IntegrationPatch): Promise<IntegrationEntity | null> {
    const res = await prisma.integration.updateMany({
      where: { id },
      data: { ...(toData(patch) as Prisma.IntegrationUpdateManyMutationInput), version: { increment: 1 } },
    });
    return res.count === 0 ? null : this.findById(id);
  }

  async saveCredentials(id: string, credentials: SealedSecret | null, tokenExpiresAt: Date | null): Promise<void> {
    await prisma.integration.updateMany({ where: { id }, data: { credentials: sealed(credentials), tokenExpiresAt } });
  }

  async touchLastEvent(id: string, at: Date): Promise<void> {
    await prisma.integration.updateMany({ where: { id }, data: { lastEventAt: at } });
  }

  async touchUpdated(id: string, at: Date): Promise<void> {
    await prisma.integration.updateMany({ where: { id }, data: { updatedAt: at } });
  }

  async delete(id: string): Promise<void> {
    await prisma.integration.deleteMany({ where: { id } });
  }

  async listActiveByTarget(scopeType: IntegrationTargetScopeType, scopeId: string): Promise<IntegrationEntity[]> {
    const rows = await prisma.integration.findMany({ where: { targetScopeType: scopeType, targetScopeId: scopeId, status: "ACTIVE" } });
    return rows.map(toIntegrationEntity);
  }

  async listActiveByCreators(workspaceId: string, userIds: string[]): Promise<IntegrationEntity[]> {
    if (userIds.length === 0) return [];
    const rows = await prisma.integration.findMany({ where: { workspaceId, status: "ACTIVE", createdBy: { in: userIds } } });
    return rows.map(toIntegrationEntity);
  }

  async listAdmin(filter: AdminIntegrationFilter): Promise<{ items: IntegrationEntity[]; total: number }> {
    const where: Prisma.IntegrationWhereInput = {
      ...(filter.status?.length && { status: { in: filter.status } }),
      ...(filter.provider && { provider: filter.provider }),
      ...(filter.workspaceId && { workspaceId: filter.workspaceId }),
    };
    const [rows, total] = await Promise.all([
      prisma.integration.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (filter.page - 1) * filter.limit, take: filter.limit }),
      prisma.integration.count({ where }),
    ]);
    return { items: rows.map(toIntegrationEntity), total };
  }

  async providerStats(): Promise<ProviderStatRow[]> {
    const rows = await prisma.integration.groupBy({ by: ["provider", "status"], _count: { _all: true } });
    return rows.map((r) => ({ provider: r.provider, status: r.status, count: r._count._all }));
  }

  async listIdle(before: Date, limit: number): Promise<IntegrationEntity[]> {
    const rows = await prisma.integration.findMany({
      where: {
        status: "ACTIVE",
        OR: [{ lastEventAt: { lt: before, not: null } }, { lastEventAt: null, createdAt: { lt: before } }],
      },
      orderBy: { updatedAt: "asc" },
      take: limit,
    });
    return rows.map(toIntegrationEntity);
  }
}

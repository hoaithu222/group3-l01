import type { SealedSecret } from "../../../core/utils/crypto";
import type { IntegrationProviderValue, IntegrationTargetScopeType } from "../../../core/constants/integration";
import type { OutboxEventInput } from "../../../infrastructure/queue";
import type { IntegrationEntity } from "../entities/integration.interface";
import type {
  AdminIntegrationFilter,
  IIntegrationRepository,
  IntegrationPatch,
  ProviderStatRow,
  UpsertIntegrationInput,
} from "./integration.repository.interface";

/** Repository in-memory cho unit test (KHÔNG dùng ngoài test): mô phỏng khoá unique `(workspaceId, provider, externalAccountId)`, CAS `version`. */
export class InMemoryIntegrationRepository implements IIntegrationRepository {
  readonly rows = new Map<string, IntegrationEntity>();
  /** Dòng outbox mà `upsert` đã ghi (assert lịch làm mới token). */
  readonly outboxRows: OutboxEventInput[] = [];
  private seq = 0;

  constructor(private readonly now: () => Date = () => new Date()) {}

  findById(id: string): Promise<IntegrationEntity | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row ? { ...row } : null);
  }

  listByWorkspace(workspaceId: string): Promise<IntegrationEntity[]> {
    return Promise.resolve([...this.rows.values()].filter((r) => r.workspaceId === workspaceId).map((r) => ({ ...r })));
  }

  countByWorkspace(workspaceId: string): Promise<number> {
    return Promise.resolve([...this.rows.values()].filter((r) => r.workspaceId === workspaceId).length);
  }

  findByExternal(provider: IntegrationProviderValue, externalAccountId: string): Promise<IntegrationEntity[]> {
    return Promise.resolve([...this.rows.values()].filter((r) => r.provider === provider && r.externalAccountId === externalAccountId).map((r) => ({ ...r })));
  }

  findByWebhookSecretHash(hash: string): Promise<IntegrationEntity | null> {
    const row = [...this.rows.values()].find((r) => r.webhookSecretHash === hash);
    return Promise.resolve(row ? { ...row } : null);
  }

  upsert(input: UpsertIntegrationInput): Promise<{ entity: IntegrationEntity; created: boolean }> {
    const existing = [...this.rows.values()].find((r) => r.workspaceId === input.workspaceId && r.provider === input.provider && r.externalAccountId === input.externalAccountId);
    const at = this.now();
    let row: IntegrationEntity;
    if (existing) {
      row = {
        ...existing,
        externalName: input.externalName,
        credentials: input.credentials,
        tokenExpiresAt: input.tokenExpiresAt,
        scopes: input.scopes,
        webhookSecretHash: input.webhookSecretHash ?? existing.webhookSecretHash,
        status: "ACTIVE",
        statusReason: null,
        version: existing.version + 1,
        updatedAt: at,
      };
    } else {
      row = {
        id: `int_${++this.seq}`,
        workspaceId: input.workspaceId,
        provider: input.provider,
        externalAccountId: input.externalAccountId,
        externalName: input.externalName,
        credentials: input.credentials,
        tokenExpiresAt: input.tokenExpiresAt,
        scopes: input.scopes,
        config: structuredClone(input.config),
        targetScopeType: input.targetScopeType,
        targetScopeId: input.targetScopeId,
        webhookSecretHash: input.webhookSecretHash,
        externalHookIds: [],
        status: "ACTIVE",
        statusReason: null,
        createdBy: input.createdBy,
        lastEventAt: null,
        version: 1,
        createdAt: at,
        updatedAt: at,
      };
    }
    this.rows.set(row.id, row);
    for (const event of input.outbox?.(row.id) ?? []) this.outboxRows.push(event);
    return Promise.resolve({ entity: { ...row }, created: !existing });
  }

  private apply(id: string, patch: IntegrationPatch): IntegrationEntity | null {
    const row = this.rows.get(id);
    if (!row) return null;
    const next: IntegrationEntity = {
      ...row,
      ...(patch.config !== undefined && { config: structuredClone(patch.config) }),
      ...(patch.createdBy !== undefined && { createdBy: patch.createdBy }),
      ...(patch.targetScopeType !== undefined && { targetScopeType: patch.targetScopeType }),
      ...(patch.targetScopeId !== undefined && { targetScopeId: patch.targetScopeId }),
      ...(patch.externalHookIds !== undefined && { externalHookIds: [...patch.externalHookIds] }),
      ...(patch.webhookSecretHash !== undefined && { webhookSecretHash: patch.webhookSecretHash }),
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.statusReason !== undefined && { statusReason: patch.statusReason }),
      version: row.version + 1,
      updatedAt: this.now(),
    };
    this.rows.set(id, next);
    return { ...next };
  }

  updateWithVersion(id: string, expectedVersion: number, patch: IntegrationPatch): Promise<IntegrationEntity | null> {
    const row = this.rows.get(id);
    if (!row || row.version !== expectedVersion) return Promise.resolve(null);
    return Promise.resolve(this.apply(id, patch));
  }

  patch(id: string, patch: IntegrationPatch): Promise<IntegrationEntity | null> {
    return Promise.resolve(this.apply(id, patch));
  }

  saveCredentials(id: string, credentials: SealedSecret | null, tokenExpiresAt: Date | null): Promise<void> {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, credentials, tokenExpiresAt });
    return Promise.resolve();
  }

  touchLastEvent(id: string, at: Date): Promise<void> {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, lastEventAt: at });
    return Promise.resolve();
  }

  touchUpdated(id: string, at: Date): Promise<void> {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, updatedAt: at });
    return Promise.resolve();
  }

  delete(id: string): Promise<void> {
    this.rows.delete(id);
    return Promise.resolve();
  }

  listActiveByTarget(scopeType: IntegrationTargetScopeType, scopeId: string): Promise<IntegrationEntity[]> {
    return Promise.resolve([...this.rows.values()].filter((r) => r.status === "ACTIVE" && r.targetScopeType === scopeType && r.targetScopeId === scopeId).map((r) => ({ ...r })));
  }

  listActiveByCreators(workspaceId: string, userIds: string[]): Promise<IntegrationEntity[]> {
    return Promise.resolve([...this.rows.values()].filter((r) => r.status === "ACTIVE" && r.workspaceId === workspaceId && userIds.includes(r.createdBy)).map((r) => ({ ...r })));
  }

  listAdmin(filter: AdminIntegrationFilter): Promise<{ items: IntegrationEntity[]; total: number }> {
    const all = [...this.rows.values()]
      .filter((r) => (!filter.status?.length || filter.status.includes(r.status)) && (!filter.provider || r.provider === filter.provider) && (!filter.workspaceId || r.workspaceId === filter.workspaceId))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const start = (filter.page - 1) * filter.limit;
    return Promise.resolve({ items: all.slice(start, start + filter.limit).map((r) => ({ ...r })), total: all.length });
  }

  providerStats(): Promise<ProviderStatRow[]> {
    const counts = new Map<string, ProviderStatRow>();
    for (const r of this.rows.values()) {
      const key = `${r.provider}:${r.status}`;
      const cur = counts.get(key) ?? { provider: r.provider, status: r.status, count: 0 };
      cur.count += 1;
      counts.set(key, cur);
    }
    return Promise.resolve([...counts.values()]);
  }

  listIdle(before: Date, limit: number): Promise<IntegrationEntity[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((r) => r.status === "ACTIVE" && (r.lastEventAt ? r.lastEventAt < before : r.createdAt < before))
        .slice(0, limit)
        .map((r) => ({ ...r }))
    );
  }
}

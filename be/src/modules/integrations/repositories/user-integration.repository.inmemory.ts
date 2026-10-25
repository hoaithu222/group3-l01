import type { SealedSecret } from "../../../core/utils/crypto";
import type { IntegrationProviderValue } from "../../../core/constants/integration";
import type { OutboxEventInput } from "../../../infrastructure/queue";
import type { IntegrationStatusValue, UserIntegrationEntity } from "../entities/integration.interface";
import type { IUserIntegrationRepository, UpsertUserIntegrationInput } from "./user-integration.repository.interface";

/** Repository in-memory cho unit test: mô phỏng `@@unique([userId, provider])`. */
export class InMemoryUserIntegrationRepository implements IUserIntegrationRepository {
  readonly rows = new Map<string, UserIntegrationEntity>();
  readonly outboxRows: OutboxEventInput[] = [];
  private seq = 0;

  constructor(private readonly now: () => Date = () => new Date()) {}

  findById(id: string): Promise<UserIntegrationEntity | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row ? { ...row } : null);
  }

  listByUser(userId: string): Promise<UserIntegrationEntity[]> {
    return Promise.resolve([...this.rows.values()].filter((r) => r.userId === userId).map((r) => ({ ...r })));
  }

  findByUserProvider(userId: string, provider: IntegrationProviderValue): Promise<UserIntegrationEntity | null> {
    const row = [...this.rows.values()].find((r) => r.userId === userId && r.provider === provider);
    return Promise.resolve(row ? { ...row } : null);
  }

  upsert(input: UpsertUserIntegrationInput): Promise<UserIntegrationEntity> {
    const existing = [...this.rows.values()].find((r) => r.userId === input.userId && r.provider === input.provider);
    const at = this.now();
    const row: UserIntegrationEntity = existing
      ? { ...existing, externalAccountId: input.externalAccountId, credentials: input.credentials, tokenExpiresAt: input.tokenExpiresAt, status: "ACTIVE", statusReason: null, updatedAt: at }
      : {
          id: `uint_${++this.seq}`,
          userId: input.userId,
          provider: input.provider,
          externalAccountId: input.externalAccountId,
          credentials: input.credentials,
          tokenExpiresAt: input.tokenExpiresAt,
          calendarId: "primary",
          status: "ACTIVE",
          statusReason: null,
          createdAt: at,
          updatedAt: at,
        };
    this.rows.set(row.id, row);
    for (const event of input.outbox?.(row.id) ?? []) this.outboxRows.push(event);
    return Promise.resolve({ ...row });
  }

  saveCredentials(id: string, credentials: SealedSecret | null, tokenExpiresAt: Date | null): Promise<void> {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, credentials, tokenExpiresAt });
    return Promise.resolve();
  }

  setStatus(id: string, status: IntegrationStatusValue, reason: string | null, clearCredentials = false): Promise<UserIntegrationEntity | null> {
    const row = this.rows.get(id);
    if (!row) return Promise.resolve(null);
    const next = { ...row, status, statusReason: reason, ...(clearCredentials && { credentials: null, tokenExpiresAt: null }), updatedAt: this.now() };
    this.rows.set(id, next);
    return Promise.resolve({ ...next });
  }

  delete(id: string): Promise<void> {
    this.rows.delete(id);
    return Promise.resolve();
  }

  findActiveByUserIds(userIds: string[], provider: IntegrationProviderValue): Promise<UserIntegrationEntity[]> {
    return Promise.resolve([...this.rows.values()].filter((r) => r.status === "ACTIVE" && r.provider === provider && userIds.includes(r.userId)).map((r) => ({ ...r })));
  }
}

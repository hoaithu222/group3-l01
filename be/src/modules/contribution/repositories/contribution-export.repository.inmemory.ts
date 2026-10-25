/* eslint-disable @typescript-eslint/require-await -- bản in-memory (test) cài đặt interface bất đồng bộ */
import { newObjectId } from "../../../core/utils/object-id";
import type { ContributionExportRecord } from "../entities/contribution.interface";
import type { CreateExportInput, IContributionExportRepository } from "./contribution-export.repository.interface";
import { UniqueViolationError, type TxHandle } from "./tx";

/** In-memory (test). */
export class InMemoryContributionExportRepository implements IContributionExportRepository {
  readonly records = new Map<string, ContributionExportRecord>();

  async findById(id: string): Promise<ContributionExportRecord | null> {
    const r = this.records.get(id);
    return r ? { ...r } : null;
  }

  async findByDedupeKey(dedupeKey: string): Promise<ContributionExportRecord | null> {
    const r = [...this.records.values()].find((x) => x.dedupeKey === dedupeKey);
    return r ? { ...r } : null;
  }

  async create(input: CreateExportInput, _tx?: TxHandle): Promise<ContributionExportRecord> {
    const values = [...this.records.values()];
    if (values.some((x) => x.dedupeKey === input.dedupeKey || x.verifyCode === input.verifyCode)) throw new UniqueViolationError("unique");
    const record: ContributionExportRecord = {
      id: newObjectId(),
      ...input,
      status: "QUEUED",
      assetId: null,
      error: null,
      createdAt: new Date(),
      readyAt: null,
    };
    this.records.set(record.id, record);
    return { ...record };
  }

  async claimRunning(id: string): Promise<boolean> {
    const r = this.records.get(id);
    if (!r || (r.status !== "QUEUED" && r.status !== "RUNNING")) return false;
    r.status = "RUNNING";
    return true;
  }

  async updateData(id: string, dataHash: string, dedupeKey: string): Promise<boolean> {
    const r = this.records.get(id);
    if (!r) return false;
    if ([...this.records.values()].some((x) => x.id !== id && x.dedupeKey === dedupeKey)) return false;
    r.dataHash = dataHash;
    r.dedupeKey = dedupeKey;
    return true;
  }

  async markReady(id: string, assetId: string, at: Date): Promise<void> {
    const r = this.records.get(id);
    if (r) Object.assign(r, { status: "READY", assetId, readyAt: at, error: null });
  }

  async markFailed(id: string, error: string): Promise<void> {
    const r = this.records.get(id);
    if (r && (r.status === "QUEUED" || r.status === "RUNNING")) Object.assign(r, { status: "FAILED", error, dedupeKey: `failed:${id}` });
  }

  async listDueForExpiry(now: Date, limit: number): Promise<ContributionExportRecord[]> {
    return [...this.records.values()]
      .filter((r) => r.status === "READY" && r.expiresAt <= now)
      .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  async markExpired(id: string): Promise<boolean> {
    const r = this.records.get(id);
    if (!r || r.status !== "READY") return false;
    Object.assign(r, { status: "EXPIRED", dedupeKey: `expired:${id}` });
    return true;
  }

  async countByWorkspace(workspaceId: string, since: Date): Promise<{ ready: number; failed: number }> {
    const rows = [...this.records.values()].filter((r) => r.workspaceId === workspaceId && r.createdAt >= since);
    return { ready: rows.filter((r) => r.status === "READY" || r.status === "EXPIRED").length, failed: rows.filter((r) => r.status === "FAILED").length };
  }
}

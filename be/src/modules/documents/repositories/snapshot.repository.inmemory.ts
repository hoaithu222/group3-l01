import { newObjectId } from "../../../core/utils/object-id";
import type { SnapshotKindValue, SnapshotMeta, SnapshotWithState } from "../entities/document.interface";
import type { ISnapshotRepository, NewSnapshot, SnapshotListParams } from "./snapshot.repository.interface";
import type { TxHandle } from "./tx";

const meta = (s: SnapshotWithState): SnapshotMeta => ({
  id: s.id,
  documentId: s.documentId,
  kind: s.kind,
  label: s.label,
  yjsVersion: s.yjsVersion,
  sizeBytes: s.sizeBytes,
  createdBy: s.createdBy,
  at: s.at,
});

/** Cài đặt in-memory cho test (thứ tự mới nhất trước theo `at`, `id` như bản Prisma). `now` chỉnh được để dựng lịch sử. */
export class InMemorySnapshotRepository implements ISnapshotRepository {
  readonly rows: SnapshotWithState[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  private sorted(documentId: string, kind?: SnapshotKindValue): SnapshotWithState[] {
    return this.rows
      .filter((r) => r.documentId === documentId && (!kind || r.kind === kind))
      .sort((a, b) => b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : -1));
  }

  async create(data: NewSnapshot, _tx?: TxHandle): Promise<SnapshotMeta> {
    const row: SnapshotWithState = {
      id: newObjectId(),
      documentId: data.documentId,
      kind: data.kind,
      label: data.label,
      yjsVersion: data.yjsVersion,
      sizeBytes: data.yjsState.byteLength,
      createdBy: data.createdBy,
      at: this.now(),
      yjsState: new Uint8Array(data.yjsState),
    };
    this.rows.push(row);
    return meta(row);
  }

  async list(p: SnapshotListParams): Promise<SnapshotMeta[]> {
    const rows = this.sorted(p.documentId, p.kind).filter((r) => {
      if (!p.cursor) return true;
      const t = r.at.getTime();
      const c = p.cursor.at.getTime();
      return t < c || (t === c && r.id < p.cursor.id);
    });
    return rows.slice(0, p.limit + 1).map(meta);
  }

  async findWithState(documentId: string, snapshotId: string): Promise<SnapshotWithState | null> {
    const row = this.rows.find((r) => r.documentId === documentId && r.id === snapshotId);
    return row ? { ...row, yjsState: new Uint8Array(row.yjsState) } : null;
  }

  async countByKind(documentId: string, kind: SnapshotKindValue): Promise<number> {
    return this.sorted(documentId, kind).length;
  }

  async latestOfKind(documentId: string, kind: SnapshotKindValue): Promise<SnapshotMeta | null> {
    const first = this.sorted(documentId, kind)[0];
    return first ? meta(first) : null;
  }

  async pruneKeepNewest(documentId: string, kind: SnapshotKindValue, keep: number, _tx?: TxHandle): Promise<number> {
    const stale = new Set(this.sorted(documentId, kind).slice(Math.max(0, keep)).map((r) => r.id));
    for (let i = this.rows.length - 1; i >= 0; i -= 1) if (stale.has(this.rows[i]?.id ?? "")) this.rows.splice(i, 1);
    return stale.size;
  }

  async countByDocuments(documentIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    for (const id of documentIds) {
      const n = this.rows.filter((r) => r.documentId === id).length;
      if (n > 0) out.set(id, n);
    }
    return out;
  }
}

import type { SnapshotKindValue, SnapshotMeta, SnapshotWithState } from "../entities/document.interface";
import type { TxHandle } from "./tx";

export interface NewSnapshot {
  documentId: string;
  kind: SnapshotKindValue;
  label: string | null;
  yjsState: Uint8Array;
  yjsVersion: number;
  createdBy: string | null;
}

export interface SnapshotListParams {
  documentId: string;
  kind?: SnapshotKindValue;
  cursor?: { at: Date; id: string } | null;
  limit: number;
}

export interface ISnapshotRepository {
  create(data: NewSnapshot, tx?: TxHandle): Promise<SnapshotMeta>;
  /** Tối đa `limit + 1` dòng, mới nhất trước. KHÔNG kèm `yjsState`. */
  list(params: SnapshotListParams): Promise<SnapshotMeta[]>;
  findWithState(documentId: string, snapshotId: string): Promise<SnapshotWithState | null>;
  countByKind(documentId: string, kind: SnapshotKindValue): Promise<number>;
  latestOfKind(documentId: string, kind: SnapshotKindValue): Promise<SnapshotMeta | null>;
  /** Xoá các bản cũ hơn `keep` bản MỚI NHẤT của `kind`; trả số bản đã xoá. */
  pruneKeepNewest(documentId: string, kind: SnapshotKindValue, keep: number, tx?: TxHandle): Promise<number>;
  /** Số bản theo tài liệu (admin "tài liệu lớn"). */
  countByDocuments(documentIds: string[]): Promise<Map<string, number>>;
}
